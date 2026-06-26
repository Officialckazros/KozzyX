

import { getDB } from "./db.js";
import {
    serverSettings,
    warnings,
    guildAutoresponders,
} from "./database.js";
import { purgeGuildRaidState } from "./raidProtection.js";
import { inviteCache } from "./inviteTracker.js";
import { purgeFeedForGuild } from "../dashboard-api.js";

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
    { table: "temp_bans", label: "Temporary bans" },
    { table: "self_role_menus", label: "Self-role menus" },
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

export async function collectGuildDataSummary(guild) {
    const db = await getDB();
    const guildId = guild.id;
    const rows = [];

    for (const { table, label } of GUILD_TABLES) {
        const r = await db.get(`SELECT COUNT(*) AS c FROM ${table} WHERE guild_id = ?`, guildId);
        rows.push({ label, count: r?.c ?? 0 });
    }


    const sroRow = await db.get(
        "SELECT COUNT(*) AS c FROM self_role_options WHERE menu_id IN (SELECT id FROM self_role_menus WHERE guild_id = ?)",
        guildId
    );
    rows.push({ label: "Self-role buttons", count: sroRow?.c ?? 0 });

    const gweRow = await db.get(
        "SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)",
        guildId
    );
    rows.push({ label: "Giveaway entries", count: gweRow?.c ?? 0 });



    const warnRow = await db.get(
        "SELECT COUNT(*) AS c FROM guild_warnings WHERE warning_key LIKE ?",
        `${guildId}-%`
    );
    rows.push({ label: "Member warnings", count: warnRow?.c ?? 0 });


    const channelIds = guildChannelIds(guild);
    if (channelIds.length) {
        const remRow = await db.get(
            `SELECT COUNT(*) AS c FROM reminders WHERE channel_id IN (${chunkPlaceholders(channelIds)})`,
            ...channelIds
        );
        rows.push({ label: "Reminders set in this server", count: remRow?.c ?? 0 });
    }


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

        const sro = await db.run(
            "DELETE FROM self_role_options WHERE menu_id IN (SELECT id FROM self_role_menus WHERE guild_id = ?)",
            guildId
        );
        record("Self-role buttons", sro?.changes ?? 0);

        const gwe = await db.run(
            "DELETE FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)",
            guildId
        );
        record("Giveaway entries", gwe?.changes ?? 0);

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


    await db.exec("VACUUM;").catch(() => {});


    serverSettings.delete(guildId);
    guildAutoresponders.delete(guildId);
    for (const key of [...warnings.keys()]) {
        if (key.startsWith(`${guildId}-`)) warnings.delete(key);
    }
    purgeGuildRaidState(guildId);
    inviteCache.delete(guildId);


    const feedCleared = purgeFeedForGuild(guildId);
    if (feedCleared) record("Dashboard activity-feed entries", feedCleared);

    return { deleted, total };
}
