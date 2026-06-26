import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getDB } from "./db.js";
import { buildCoolEmbed } from "./embeds.js";
import { getGuildSettings } from "./database.js";

const MAX_TIMEOUT = 2147483647;

export function giveawayRow(id, entryCount = 0, settings = null) {
    const emoji = settings?.giveaway?.emoji || "🎉";
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gw:enter:${id}`)
            .setLabel(`Enter${entryCount ? ` (${entryCount})` : ""}`)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Primary)
    );
}

export function buildGiveawayEmbed({ guildId, prize, winners, endTime, hostId, requiredRoleId, entryCount, ended = false, winnerIds = [] }) {
    const settings = getGuildSettings(guildId);
    const lines = [
        `**Prize:** ${prize}`,
        `**Winners:** ${winners}`,
    ];
    if (settings.giveaway?.hostMention && hostId) lines.push(`**Hosted by:** <@${hostId}>`);
    if (requiredRoleId) lines.push(`**Required role:** <@&${requiredRoleId}>`);

    if (ended) {
        lines.push("");
        lines.push(winnerIds.length
            ? `**Winner${winnerIds.length === 1 ? "" : "s"}:** ${winnerIds.map((id) => `<@${id}>`).join(", ")}`
            : "**No valid entries — no winner drawn.**");
        lines.push(`Ended <t:${Math.floor(endTime / 1000)}:R>`);
    } else {
        lines.push("");
        lines.push(`Ends <t:${Math.floor(endTime / 1000)}:F> (<t:${Math.floor(endTime / 1000)}:R>)`);
        lines.push(`**Entries:** ${entryCount}`);
        lines.push("");
        lines.push("Click the button below to enter.");
    }

    return buildCoolEmbed({
        guildId,
        type: ended ? "warning" : "success",
        title: ended ? "🎉 Giveaway Ended" : (settings.giveaway?.embedTitle || "🎉 Giveaway 🎉"),
        description: lines.join("\n"),
        footerText: ended ? "Giveaway ended" : "Good luck!",
    });
}

export async function createGiveaway({ guild, channel, prize, winners, durationMs, hostId, requiredRoleId }) {
    const db = await getDB();
    const endTime = Date.now() + durationMs;

    const result = await db.run(
        `INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, end_time, status, host_id, required_role_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        guild.id, channel.id, null, prize, winners, endTime, hostId ?? null, requiredRoleId ?? null
    );
    const id = result.lastID;

    const embed = buildGiveawayEmbed({
        guildId: guild.id, prize, winners, endTime, hostId, requiredRoleId, entryCount: 0,
    });
    const settings = getGuildSettings(guild.id);
    const msg = await channel.send({ embeds: [embed], components: [giveawayRow(id, 0, settings)] });

    await db.run("UPDATE giveaways SET message_id = ? WHERE id = ?", msg.id, id);

    const row = await db.get("SELECT * FROM giveaways WHERE id = ?", id);
    scheduleGiveaway(guild.client, row);
    return { id, message: msg };
}

export async function addEntry(giveawayId, userId) {
    const db = await getDB();
    const gw = await db.get("SELECT * FROM giveaways WHERE id = ?", giveawayId);
    if (!gw || gw.status !== "active") return { ok: false, reason: "ended" };

    const existing = await db.get(
        "SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?",
        giveawayId, userId
    );
    if (existing) return { ok: false, reason: "already", giveaway: gw };

    await db.run(
        "INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id, entered_at) VALUES (?, ?, ?)",
        giveawayId, userId, Date.now()
    );
    return { ok: true, giveaway: gw };
}

export async function entryCount(giveawayId) {
    const db = await getDB();
    const r = await db.get("SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?", giveawayId);
    return r?.c ?? 0;
}

async function drawWinners(client, gw, count) {
    const db = await getDB();
    const entries = await db.all("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?", gw.id);
    let pool = entries.map((e) => e.user_id);

    if (gw.required_role_id) {
        const guild = await client.guilds.fetch(gw.guild_id).catch(() => null);
        if (guild) {
            const filtered = [];
            for (const uid of pool) {
                const member = await guild.members.fetch(uid).catch(() => null);
                if (member && member.roles.cache.has(gw.required_role_id)) filtered.push(uid);
            }
            pool = filtered;
        }
    }

    const winners = [];
    const take = Math.min(count, pool.length);
    for (let i = 0; i < take; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
}

export async function endGiveaway(client, giveawayId, { reroll = false } = {}) {
    const db = await getDB();
    const gw = await db.get("SELECT * FROM giveaways WHERE id = ?", giveawayId);
    if (!gw) return { ok: false, reason: "not_found" };
    if (!reroll && gw.status === "ended") return { ok: false, reason: "already_ended" };

    const winnerIds = await drawWinners(client, gw, gw.winners);
    await db.run(
        "UPDATE giveaways SET status = 'ended', winner_ids = ? WHERE id = ?",
        JSON.stringify(winnerIds), giveawayId
    );

    const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
        const embed = buildGiveawayEmbed({
            guildId: gw.guild_id, prize: gw.prize, winners: gw.winners, endTime: gw.end_time,
            hostId: gw.host_id, requiredRoleId: gw.required_role_id, entryCount: 0, ended: true, winnerIds,
        });

        if (gw.message_id) {
            const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
            if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => null);
        }

        const announce = winnerIds.length
            ? `${reroll ? "🔁 New winner" : "🎉 Congratulations"} ${winnerIds.map((id) => `<@${id}>`).join(", ")} — you won **${gw.prize}**!`
            : `No valid entries for **${gw.prize}** — no winner could be drawn.`;
        await channel.send({
            content: announce,
            reply: gw.message_id ? { messageReference: gw.message_id, failIfNotExists: false } : undefined,
            allowedMentions: { users: winnerIds },
        }).catch(() => null);
    }

    return { ok: true, winnerIds, giveaway: gw };
}

export function scheduleGiveaway(client, gw) {
    if (gw.status !== "active") return;
    const diff = gw.end_time - Date.now();
    if (diff <= 0) {
        endGiveaway(client, gw.id);
        return;
    }
    if (diff > MAX_TIMEOUT) {
        setTimeout(() => scheduleGiveaway(client, gw), MAX_TIMEOUT);
        return;
    }
    setTimeout(() => endGiveaway(client, gw.id), diff);
}

export async function initGiveaways(client) {
    const db = await getDB();
    const rows = await db.all("SELECT * FROM giveaways WHERE status = 'active'");
    const now = Date.now();

    for (const gw of rows) {
        if (gw.end_time <= now) await endGiveaway(client, gw.id);
        else scheduleGiveaway(client, gw);
    }
    console.log(`Loaded ${rows.length} active giveaway(s).`);

    setInterval(async () => {
        try {
            const db2 = await getDB();
            const due = await db2.all("SELECT * FROM giveaways WHERE status = 'active' AND end_time <= ?", Date.now());
            for (const gw of due) await endGiveaway(client, gw.id);
        } catch (err) {
            console.error("[giveaways] Sweep error:", err);
        }
    }, 60_000);
}
