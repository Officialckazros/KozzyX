import { getDB } from "./db.js";
import { createCase } from "./moderationUtils.js";

const MAX_TIMEOUT = 2147483647;

export async function addTempBan({ guildId, userId, unbanAt, reason, executorId }) {
    const db = await getDB();

    await db.run("DELETE FROM temp_bans WHERE guild_id = ? AND user_id = ?", guildId, userId);
    const result = await db.run(
        "INSERT INTO temp_bans (guild_id, user_id, unban_at, reason, executor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        guildId, userId, unbanAt, reason ?? null, executorId ?? null, Date.now()
    );
    return result.lastID;
}

export async function removeTempBan(guildId, userId) {
    const db = await getDB();
    await db.run("DELETE FROM temp_bans WHERE guild_id = ? AND user_id = ?", guildId, userId);
}

export async function initTempBans(client) {
    const db = await getDB();
    const rows = await db.all("SELECT * FROM temp_bans");
    const now = Date.now();

    for (const row of rows) {
        if (row.unban_at <= now) {
            await processUnban(client, row, true);
        } else {
            scheduleTempBan(client, row);
        }
    }
    console.log(`Loaded ${rows.length} temporary ban(s).`);

    setInterval(async () => {
        try {
            const db2 = await getDB();
            const due = await db2.all("SELECT * FROM temp_bans WHERE unban_at <= ?", Date.now());
            for (const row of due) await processUnban(client, row);
        } catch (err) {
            console.error("[tempbans] Sweep error:", err);
        }
    }, 60_000);
}

export function scheduleTempBan(client, row) {
    const diff = row.unban_at - Date.now();
    if (diff <= 0) {
        processUnban(client, row);
        return;
    }
    if (diff > MAX_TIMEOUT) {
        setTimeout(() => scheduleTempBan(client, row), MAX_TIMEOUT);
        return;
    }
    setTimeout(() => processUnban(client, row), diff);
}

async function processUnban(client, row, late = false) {
    const db = await getDB();
    try {

        const stillThere = await db.get(
            "SELECT 1 FROM temp_bans WHERE id = ? AND unban_at = ?",
            row.id, row.unban_at
        );
        if (!stillThere) return;

        await db.run("DELETE FROM temp_bans WHERE id = ?", row.id);

        const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
        if (!guild) return;

        const ban = await guild.bans.fetch(row.user_id).catch(() => null);
        if (!ban) return;

        await guild.members.unban(row.user_id, "Temporary ban expired").catch(() => null);

        const target = ban.user || { id: row.user_id, tag: row.user_id };
        const executor = { id: client.user.id, tag: client.user.tag };
        await createCase({
            guild,
            action: "tempban_expire",
            target,
            executor,
            reason: late ? "Temporary ban expired (delayed)" : "Temporary ban expired",
        }).catch(() => null);
    } catch (err) {
        console.error("[tempbans] Unban failed:", err);
    }
}
