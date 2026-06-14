// Central inventory + eraser for everything the bot stores about a single guild.
//
// Used by /data_request (summary) and /data_deletion_request (full wipe). Keep
// this in sync with any new per-guild storage so deletions stay complete.

import { getDB } from "./db.js";
import {
    serverSettings,
    warnings,
    guildAutoresponders,
} from "./database.js";
import { purgeGuildRaidState } from "./raidProtection.js";
import { inviteCache } from "./inviteTracker.js";
import { purgeFeedForGuild } from "../dashboard-api.js";

// SQLite tables with a literal `guild_id` column. Table names are hardcoded
// (never interpolated from user input) so the SQL is injection-safe.
const GUILD_TABLES = [
    { table: "guild_settings", label: "Server settings & configuration" },
    { table: "guild_autoresponders", label: "Autoresponders" },
    { table: "invite_joins", label: "Invite / join tracking" },
    { table: "audit_log", label: "Audit log entries" },
    { table: "appeals", label: "Ban appeals" },
    { table: "dynamic_vcs", label: "Dynamic voice channels" },
    { table: "mod_cases", label: "Moderation cases (warns/bans/mutes)" },
    { table: "custom_commands", label: "Custom commands" },
    { table: "automations", label: "Automations" },
    { table: "giveaways", label: "Giveaways" },
    { table: "birthdays", label: "Birthdays" },
];

function chunkPlaceholders(ids) {
    return ids.map(() => "?").join(", ");
}

function guildChannelIds(guild) {
    return [...guild.channels.cache.keys()];
}

function guildRoleIds(guild) {
    return [...guild.roles.cache.keys()];
}

// Returns a list of { label, count } describing everything stored for the guild.
export async function collectGuildDataSummary(guild) {
    const db = await getDB();
    const guildId = guild.id;
    const rows = [];

    for (const { table, label } of GUILD_TABLES) {
        const r = await db.get(`SELECT COUNT(*) AS c FROM ${table} WHERE guild_id = ?`, guildId);
        rows.push({ label, count: r?.c ?? 0 });
    }

    // Warnings are keyed `${guildId}-${userId}` (guild IDs are digits only, so
    // the `${guildId}-%` prefix is unambiguous).
    const warnRow = await db.get(
        "SELECT COUNT(*) AS c FROM guild_warnings WHERE warning_key LIKE ?",
        `${guildId}-%`
    );
    rows.push({ label: "Member warnings", count: warnRow?.c ?? 0 });

    // Reminders are channel-scoped; count the ones tied to this guild's channels.
    const channelIds = guildChannelIds(guild);
    if (channelIds.length) {
        const remRow = await db.get(
            `SELECT COUNT(*) AS c FROM reminders WHERE channel_id IN (${chunkPlaceholders(channelIds)})`,
            ...channelIds
        );
        rows.push({ label: "Reminders set in this server", count: remRow?.c ?? 0 });
    }

    // Booster roles map a user to a role that lives in this guild.
    const roleIds = guildRoleIds(guild);
    if (roleIds.length) {
        const boostRow = await db.get(
            `SELECT COUNT(*) AS c FROM booster_roles WHERE role_id IN (${chunkPlaceholders(roleIds)})`,
            ...roleIds
        );
        rows.push({ label: "Booster role links", count: boostRow?.c ?? 0 });
    }

    return rows;
}

// Permanently deletes every stored record for the guild across SQLite and all
// in-memory caches. Returns { deleted: {label: count}, total }.
export async function purgeGuildData(guild) {
    const db = await getDB();
    const guildId = guild.id;
    const deleted = {};
    let total = 0;

    const record = (label, n) => {
        deleted[label] = (deleted[label] || 0) + n;
        total += n;
    };

    await db.run("BEGIN");
    try {
        for (const { table, label } of GUILD_TABLES) {
            const r = await db.run(`DELETE FROM ${table} WHERE guild_id = ?`, guildId);
            record(label, r?.changes ?? 0);
        }

        const warn = await db.run(
            "DELETE FROM guild_warnings WHERE warning_key LIKE ?",
            `${guildId}-%`
        );
        record("Member warnings", warn?.changes ?? 0);

        const channelIds = guildChannelIds(guild);
        if (channelIds.length) {
            const rem = await db.run(
                `DELETE FROM reminders WHERE channel_id IN (${chunkPlaceholders(channelIds)})`,
                ...channelIds
            );
            record("Reminders set in this server", rem?.changes ?? 0);
        }

        const roleIds = guildRoleIds(guild);
        if (roleIds.length) {
            const boost = await db.run(
                `DELETE FROM booster_roles WHERE role_id IN (${chunkPlaceholders(roleIds)})`,
                ...roleIds
            );
            record("Booster role links", boost?.changes ?? 0);
        }

        await db.run("COMMIT");
    } catch (err) {
        await db.run("ROLLBACK");
        throw err;
    }

    // Reclaim freed pages so deleted content isn't recoverable from the file.
    await db.exec("VACUUM;").catch(() => {});

    // In-memory caches kept in sync with the now-deleted rows.
    serverSettings.delete(guildId);
    guildAutoresponders.delete(guildId);
    for (const key of [...warnings.keys()]) {
        if (key.startsWith(`${guildId}-`)) warnings.delete(key);
    }
    purgeGuildRaidState(guildId);
    inviteCache.delete(guildId);

    // Dashboard activity feed entries for this guild.
    const feedCleared = purgeFeedForGuild(guildId);
    if (feedCleared) record("Dashboard activity-feed entries", feedCleared);

    return { deleted, total };
}
