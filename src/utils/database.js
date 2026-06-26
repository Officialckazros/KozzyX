import { promises as fs } from "fs";
import { Collection } from "discord.js";
import { getDB } from "./db.js";

const LEGACY_SETTINGS_FILE       = "./data/settings.json";
const LEGACY_WARNINGS_FILE       = "./data/warnings.json";
const LEGACY_AUTORESPONDERS_FILE = "./data/autoresponders.json";
const LEGACY_BOOSTER_DB_FILE     = "./data/boosterroles.json";
const LEGACY_COSMETICS_FILE      = "./data/cosmetics.json";

export const serverSettings        = new Map();
export const warnings              = new Map();
export const guildAutoresponders   = new Map();
export const boosterRolesDB        = new Map();
export const afkMap                = new Map();
export const cosmeticsMap          = new Map();
export const cooldowns             = new Collection();
export const ticketRate            = new Map();
export const ticketAutoCloseTimers = new Map();

setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, timestamps] of ticketRate) {
        const fresh = timestamps.filter(t => t > cutoff);
        if (fresh.length === 0) ticketRate.delete(key);
        else ticketRate.set(key, fresh);
    }
}, 60 * 60 * 1000);

async function readLegacyJSON(file, fallback) {
    try {
        const data = await fs.readFile(file, "utf8");
        return JSON.parse(data);
    } catch (err) {
        if (err?.code === "ENOENT") return fallback;
        console.error("Legacy JSON read error:", file, err);
        return fallback;
    }
}

function defaultTicketConfig() {
    return {
        panelTitle: "Support Tickets",
        panelText:
            "Pick a category below to open a ticket.\n\n" +
            "Tickets are private.\n" +
            "You can open up to **3 tickets per hour**.",
        categories: [
            { id: "general", label: "General Support", style: "Primary" },
            { id: "report", label: "Report User", style: "Danger" },
            { id: "bot", label: "Bot Error", style: "Secondary" },
            { id: "other", label: "Other", style: "Success" },
        ],
        autoCloseMs: 0,
        displayRoleId: null,
    };
}

function defaultEmbedColors() {
    return {
        info: 0x5865f2,
        success: 0x57f287,
        warning: 0xfaa61a,
        error: 0xed4245,
        ticket: 0x5865f2,
        mod: 0xfee75c,
        case: 0x5865f2,
        afk: 0x9b59b6,
        autoresponder: 0x2ecc71,
        settings: 0x3498db,
    };
}

function defaultPlugins() {
    return {
        conversation_memory: false,
        ai_moderation:       false,
        dynamic_vc:          false,
        invite_tracking:     false,
        anti_raid:           false,
        appeals:             false,
        audit_log:           false,
    };
}

function defaultAntiRaidConfig() {
    return {
        threshold: 10,
        windowMs: 60_000,
        action: "lockdown",
        minAccountAgeMs: 0,
        massMentionThreshold: 5,
        massMentionTimeoutMs: 10 * 60_000,
        alertChannelId: null,
    };
}

function defaultDynamicVcConfig() {
    return { triggerChannelId: null, categoryId: null, userLimit: 0 };
}

function defaultModerationConfig() {
    return {
        dmOnAction: true,
        requireReason: false,
        defaultReason: "No reason provided.",
        defaultPurge: 100,
        defaultBanDeleteDays: 0,
        logChannelId: null,
    };
}

function defaultVerificationConfig() {
    return {
        enabled: false,
        channelId: null,
        messageId: null,
        roleId: null,
        minAccountAgeMs: 0,
        buttonLabel: "Verify",
        buttonEmoji: "",
        buttonStyle: "Success",
        title: "Verification Required",
        description: "Click the button below to verify yourself and gain access to the server.",
        successMessage: "You're verified! Welcome aboard.",
    };
}

function defaultGiveawayConfig() {
    return {
        defaultWinners: 1,
        requiredRoleId: null,
        hostMention: true,
        emoji: "",
        embedTitle: "Giveaway",
    };
}

function defaultSelfRolesConfig() {
    return { maxPerMenu: 25 };
}

function mergeDefaults(settings, key, defaults) {
    if (!settings[key] || typeof settings[key] !== "object") {
        settings[key] = defaults;
        return;
    }
    for (const [k, v] of Object.entries(defaults)) {
        if (typeof settings[key][k] === "undefined") settings[key][k] = v;
    }
}

export function getGuildSettings(guildId) {
    let s = serverSettings.get(guildId);
    if (!s) {
        s = {
            caseChannelId: null,
            ticketPanelChannelId: null,
            ticket: defaultTicketConfig(),
            autoresponderFilterOn: true,
            applyChannelId: null,
            applicationsOpen: false,
            warnThresholds: [],
            nickLocks: {},
            embedColors: defaultEmbedColors(),
            badWords: [],
            boosterWelcomeBonus: { enabled: true, title: "Server Booster" },
            plugins: defaultPlugins(),
            antiRaid: defaultAntiRaidConfig(),
            dynamicVc: defaultDynamicVcConfig(),
            moderation: defaultModerationConfig(),
            verification: defaultVerificationConfig(),
            giveaway: defaultGiveawayConfig(),
            selfRoles: defaultSelfRolesConfig(),
            appealsChannelId: null,
            slavicResponseEnabled: false,
        };
        serverSettings.set(guildId, s);
    }

    if (!s.ticket) s.ticket = defaultTicketConfig();
    if (typeof s.autoresponderFilterOn !== "boolean") s.autoresponderFilterOn = true;
    if (!s.embedColors) s.embedColors = defaultEmbedColors();

    const def = defaultEmbedColors();
    for (const [k, v] of Object.entries(def)) {
        if (typeof s.embedColors[k] !== "number") s.embedColors[k] = v;
    }
    if (!Array.isArray(s.badWords)) s.badWords = [];
    if (!s.plugins || typeof s.plugins !== "object") s.plugins = defaultPlugins();
    else {
        const dp = defaultPlugins();
        for (const [k, v] of Object.entries(dp)) {
            if (typeof s.plugins[k] !== "boolean") s.plugins[k] = v;
        }
    }
    if (!s.antiRaid || typeof s.antiRaid !== "object") s.antiRaid = defaultAntiRaidConfig();
    if (!s.dynamicVc || typeof s.dynamicVc !== "object") s.dynamicVc = defaultDynamicVcConfig();
    mergeDefaults(s, "moderation", defaultModerationConfig());
    mergeDefaults(s, "verification", defaultVerificationConfig());
    mergeDefaults(s, "giveaway", defaultGiveawayConfig());
    mergeDefaults(s, "selfRoles", defaultSelfRolesConfig());
    if (typeof s.appealsChannelId === "undefined") s.appealsChannelId = null;
    if (typeof s.slavicResponseEnabled !== "boolean") s.slavicResponseEnabled = false;

    if (!s.welcome || typeof s.welcome !== "object") s.welcome = { enabled: false, channelId: null, message: "Welcome {user} to the server!" };
    if (!s.goodbye || typeof s.goodbye !== "object") s.goodbye = { enabled: false, channelId: null, message: "{user} left the server." };
    if (!s.leveling || typeof s.leveling !== "object") s.leveling = { enabled: false, channelId: null, message: "Congrats {user}, you reached level {level}!" };
    if (!s.birthdays || typeof s.birthdays !== "object") s.birthdays = { enabled: false, channelId: null, message: "Happy Birthday {user}!" };

    if (!s.boosterWelcomeBonus || typeof s.boosterWelcomeBonus !== "object") {
        s.boosterWelcomeBonus = { enabled: true, title: "Server Booster" };
    } else {
        if (typeof s.boosterWelcomeBonus.enabled !== "boolean") s.boosterWelcomeBonus.enabled = true;
        if (typeof s.boosterWelcomeBonus.title !== "string") s.boosterWelcomeBonus.title = "Server Booster";
    }

    return s;
}

export async function loadSettings() {
    const db = await getDB();
    const rows = await db.all("SELECT guild_id, settings_json FROM guild_settings");

    if (rows.length === 0) {
        const legacy = await readLegacyJSON(LEGACY_SETTINGS_FILE, {});
        if (Object.keys(legacy).length > 0) {
            await db.run("BEGIN");
            try {
                for (const [guildId, settings] of Object.entries(legacy)) {
                    serverSettings.set(guildId, settings);
                    await db.run(
                        "INSERT OR REPLACE INTO guild_settings (guild_id, settings_json) VALUES (?, ?)",
                        guildId, JSON.stringify(settings)
                    );
                }
                await db.run("COMMIT");
            } catch (err) {
                await db.run("ROLLBACK");
                console.error("Settings migration failed:", err);
            }
            console.log(`Migrated settings for ${serverSettings.size} guild(s) from JSON to SQLite.`);
            return;
        }
    }

    serverSettings.clear();
    for (const row of rows) {
        try { serverSettings.set(row.guild_id, JSON.parse(row.settings_json)); }
        catch {  }
    }
    console.log(`Loaded settings for ${serverSettings.size} guild(s).`);
}

export async function saveSettings() {
    const db = await getDB();
    await db.run("BEGIN");
    try {
        for (const [guildId, settings] of serverSettings) {
            await db.run(
                "INSERT OR REPLACE INTO guild_settings (guild_id, settings_json) VALUES (?, ?)",
                guildId, JSON.stringify(settings)
            );
        }
        await db.run("COMMIT");
    } catch (err) {
        await db.run("ROLLBACK");
        console.error("saveSettings failed:", err);
    }
}

export function getWarningData(guildId, userId) {
    const key = `${guildId}-${userId}`;
    let data = warnings.get(key);
    if (!data) {
        data = { count: 0, history: [] };
        warnings.set(key, data);
    }
    return data;
}

export async function loadWarnings() {
    const db = await getDB();
    const rows = await db.all("SELECT warning_key, count, history_json FROM guild_warnings");

    if (rows.length === 0) {
        const legacy = await readLegacyJSON(LEGACY_WARNINGS_FILE, {});
        if (Object.keys(legacy).length > 0) {
            await db.run("BEGIN");
            try {
                for (const [key, val] of Object.entries(legacy)) {
                    warnings.set(key, val);
                    await db.run(
                        "INSERT OR REPLACE INTO guild_warnings (warning_key, count, history_json) VALUES (?, ?, ?)",
                        key, val.count || 0, JSON.stringify(val.history || [])
                    );
                }
                await db.run("COMMIT");
            } catch (err) {
                await db.run("ROLLBACK");
                console.error("Warnings migration failed:", err);
            }
            console.log(`Migrated warnings from JSON to SQLite.`);
            return;
        }
    }

    warnings.clear();
    for (const row of rows) {
        try {
            warnings.set(row.warning_key, {
                count: row.count,
                history: JSON.parse(row.history_json),
            });
        } catch {  }
    }
}

export async function saveWarnings() {
    const db = await getDB();
    await db.run("BEGIN");
    try {
        for (const [key, val] of warnings) {
            await db.run(
                "INSERT OR REPLACE INTO guild_warnings (warning_key, count, history_json) VALUES (?, ?, ?)",
                key, val.count || 0, JSON.stringify(val.history || [])
            );
        }
        await db.run("COMMIT");
    } catch (err) {
        await db.run("ROLLBACK");
        console.error("saveWarnings failed:", err);
    }
}

export async function loadAutoresponders() {
    const db = await getDB();
    const rows = await db.all("SELECT guild_id, trigger, response FROM guild_autoresponders");

    if (rows.length === 0) {
        const legacy = await readLegacyJSON(LEGACY_AUTORESPONDERS_FILE, {});
        if (Object.keys(legacy).length > 0) {
            await db.run("BEGIN");
            try {
                for (const [guildId, arr] of Object.entries(legacy)) {
                    if (!Array.isArray(arr)) continue;
                    const cleaned = arr
                        .filter(x => x?.trigger)
                        .map(x => ({ trigger: String(x.trigger).toLowerCase(), response: String(x.response ?? "") }));
                    guildAutoresponders.set(guildId, cleaned);
                    for (const entry of cleaned) {
                        await db.run(
                            "INSERT OR REPLACE INTO guild_autoresponders (guild_id, trigger, response) VALUES (?, ?, ?)",
                            guildId, entry.trigger, entry.response
                        );
                    }
                }
                await db.run("COMMIT");
            } catch (err) {
                await db.run("ROLLBACK");
                console.error("Autoresponders migration failed:", err);
            }
            console.log(`Migrated autoresponders from JSON to SQLite.`);
            return;
        }
    }

    guildAutoresponders.clear();
    for (const row of rows) {
        const arr = guildAutoresponders.get(row.guild_id) || [];
        arr.push({ trigger: row.trigger, response: row.response });
        guildAutoresponders.set(row.guild_id, arr);
    }
}

export async function saveAutoresponders() {
    const db = await getDB();
    await db.run("BEGIN");
    try {
        await db.run("DELETE FROM guild_autoresponders");
        for (const [guildId, arr] of guildAutoresponders) {
            for (const entry of arr) {
                await db.run(
                    "INSERT INTO guild_autoresponders (guild_id, trigger, response) VALUES (?, ?, ?)",
                    guildId, entry.trigger, entry.response
                );
            }
        }
        await db.run("COMMIT");
    } catch (err) {
        await db.run("ROLLBACK");
        console.error("saveAutoresponders failed:", err);
    }
}

export async function loadBoosterRoles() {
    const db = await getDB();
    const rows = await db.all("SELECT user_id, role_id FROM booster_roles");

    if (rows.length === 0) {
        const legacy = await readLegacyJSON(LEGACY_BOOSTER_DB_FILE, {});
        if (Object.keys(legacy).length > 0) {
            await db.run("BEGIN");
            try {
                for (const [userId, roleId] of Object.entries(legacy)) {
                    boosterRolesDB.set(userId, roleId);
                    await db.run(
                        "INSERT OR REPLACE INTO booster_roles (user_id, role_id) VALUES (?, ?)",
                        userId, roleId
                    );
                }
                await db.run("COMMIT");
            } catch (err) {
                await db.run("ROLLBACK");
                console.error("Booster roles migration failed:", err);
            }
            console.log(`Migrated booster roles from JSON to SQLite.`);
            return;
        }
    }

    boosterRolesDB.clear();
    for (const row of rows) boosterRolesDB.set(row.user_id, row.role_id);
}

export async function saveBoosterRoles() {
    const db = await getDB();
    await db.run("BEGIN");
    try {
        await db.run("DELETE FROM booster_roles");
        for (const [userId, roleId] of boosterRolesDB) {
            await db.run("INSERT INTO booster_roles (user_id, role_id) VALUES (?, ?)", userId, roleId);
        }
        await db.run("COMMIT");
    } catch (err) {
        await db.run("ROLLBACK");
        console.error("saveBoosterRoles failed:", err);
    }
}

export async function loadAfk() {
    const db = await getDB();
    const rows = await db.all("SELECT user_id, reason, since FROM afk");
    afkMap.clear();
    for (const row of rows) afkMap.set(row.user_id, { reason: row.reason, since: row.since });
    if (afkMap.size > 0) console.log(`Loaded ${afkMap.size} AFK user(s).`);
}

export async function setAfk(userId, reason) {
    const since = Date.now();
    afkMap.set(userId, { reason, since });
    const db = await getDB();
    await db.run(
        "INSERT OR REPLACE INTO afk (user_id, reason, since) VALUES (?, ?, ?)",
        userId, reason, since
    );
}

export async function clearAfk(userId) {
    afkMap.delete(userId);
    const db = await getDB();
    await db.run("DELETE FROM afk WHERE user_id = ?", userId);
}

export async function loadCosmetics() {
    const db = await getDB();
    const rows = await db.all("SELECT user_id, manual_title, auto_title FROM cosmetics");

    if (rows.length === 0) {
        try {
            const data = await fs.readFile(LEGACY_COSMETICS_FILE, "utf8");
            const legacy = JSON.parse(data);
            if (legacy && typeof legacy === "object") {
                await db.run("BEGIN");
                try {
                    for (const [userId, val] of Object.entries(legacy)) {
                        if (!val || typeof val !== "object") continue;
                        const manual = val.manualTitle ?? null;
                        const auto = val.autoTitle ?? null;
                        cosmeticsMap.set(userId, { manualTitle: manual, autoTitle: auto });
                        await db.run(
                            "INSERT OR REPLACE INTO cosmetics (user_id, manual_title, auto_title) VALUES (?, ?, ?)",
                            userId, manual, auto
                        );
                    }
                    await db.run("COMMIT");
                } catch (err) {
                    await db.run("ROLLBACK");
                    console.error("Cosmetics migration failed:", err);
                }
                console.log(`Migrated cosmetics from JSON to SQLite.`);
                return;
            }
        } catch (err) {
            if (err?.code !== "ENOENT") console.error("Cosmetics legacy read error:", err);
        }
    }

    cosmeticsMap.clear();
    for (const row of rows) {
        cosmeticsMap.set(row.user_id, {
            manualTitle: row.manual_title ?? null,
            autoTitle: row.auto_title ?? null,
        });
    }
}

export async function getUserCosmetics(userId) {
    const cur = cosmeticsMap.get(userId) || {};
    return {
        manualTitle: cur.manualTitle ?? null,
        autoTitle: cur.autoTitle ?? null,
    };
}

export async function setUserCosmetics(userId, patch) {
    const cur = cosmeticsMap.get(userId) || { manualTitle: null, autoTitle: null };
    const updated = { ...cur, ...patch };
    cosmeticsMap.set(userId, updated);
    const db = await getDB();
    await db.run(
        "INSERT OR REPLACE INTO cosmetics (user_id, manual_title, auto_title) VALUES (?, ?, ?)",
        userId, updated.manualTitle ?? null, updated.autoTitle ?? null
    );
}
