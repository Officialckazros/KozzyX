import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

let db;
const DB_FILE = process.env.DATABASE_PATH || './data/database.sqlite';

export async function initDB() {
    if (db) return db;
    await mkdir(dirname(DB_FILE), { recursive: true });

    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    await db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            item TEXT NOT NULL,
            created_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            remind_at INTEGER,
            channel_id TEXT
        );
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS guild_warnings (
            warning_key TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            history_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS guild_autoresponders (
            guild_id TEXT NOT NULL,
            trigger TEXT NOT NULL,
            response TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (guild_id, trigger)
        );
        CREATE TABLE IF NOT EXISTS booster_roles (
            user_id TEXT PRIMARY KEY,
            role_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS afk (
            user_id TEXT PRIMARY KEY,
            reason TEXT NOT NULL DEFAULT '',
            since INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cosmetics (
            user_id TEXT PRIMARY KEY,
            manual_title TEXT,
            auto_title TEXT
        );
        CREATE TABLE IF NOT EXISTS invite_joins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            inviter_id TEXT,
            invite_code TEXT,
            joined_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_invite_joins_guild ON invite_joins (guild_id);
        CREATE INDEX IF NOT EXISTS idx_invite_joins_inviter ON invite_joins (guild_id, inviter_id);
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_id TEXT,
            executor_id TEXT,
            reason TEXT,
            changes_json TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log (guild_id, target_id);
        CREATE TABLE IF NOT EXISTS appeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            staff_id TEXT,
            created_at INTEGER NOT NULL,
            resolved_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS dynamic_vcs (
            channel_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mod_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            case_number INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_id TEXT NOT NULL,
            target_tag TEXT,
            executor_id TEXT NOT NULL,
            executor_tag TEXT,
            reason TEXT,
            duration_ms INTEGER,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mod_cases_guild ON mod_cases (guild_id, case_number);
        CREATE INDEX IF NOT EXISTS idx_mod_cases_target ON mod_cases (guild_id, target_id);
        CREATE TABLE IF NOT EXISTS custom_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            response TEXT NOT NULL,
            enabled INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS automations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_data TEXT,
            action_type TEXT NOT NULL,
            action_data TEXT,
            enabled INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS giveaways (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            prize TEXT NOT NULL,
            winners INTEGER NOT NULL DEFAULT 1,
            end_time INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS birthdays (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            birthday_date TEXT NOT NULL,
            PRIMARY KEY (user_id, guild_id)
        );
        CREATE TABLE IF NOT EXISTS temp_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            unban_at INTEGER NOT NULL,
            reason TEXT,
            executor_id TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_temp_bans_due ON temp_bans (unban_at);
        CREATE INDEX IF NOT EXISTS idx_temp_bans_guild ON temp_bans (guild_id, user_id);
        CREATE TABLE IF NOT EXISTS self_role_menus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            title TEXT NOT NULL DEFAULT 'Self Roles',
            description TEXT,
            mode TEXT NOT NULL DEFAULT 'multiple',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_self_role_menus_guild ON self_role_menus (guild_id);
        CREATE INDEX IF NOT EXISTS idx_self_role_menus_message ON self_role_menus (message_id);
        CREATE TABLE IF NOT EXISTS self_role_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id INTEGER NOT NULL,
            role_id TEXT NOT NULL,
            label TEXT NOT NULL,
            emoji TEXT,
            style TEXT NOT NULL DEFAULT 'Secondary',
            position INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_self_role_options_menu ON self_role_options (menu_id);
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            giveaway_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            entered_at INTEGER NOT NULL,
            PRIMARY KEY (giveaway_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_giveaway_entries_gw ON giveaway_entries (giveaway_id);
    `);

    await addColumnIfMissing("giveaways", "host_id", "TEXT");
    await addColumnIfMissing("giveaways", "required_role_id", "TEXT");
    await addColumnIfMissing("giveaways", "winner_ids", "TEXT");

    console.log("Database initialized");
    return db;
}

async function addColumnIfMissing(table, column, definition) {
    try {
        const cols = await db.all(`PRAGMA table_info(${table})`);
        if (cols.some((c) => c.name === column)) return;
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
        console.error(`[db] addColumnIfMissing(${table}.${column}) failed:`, err?.message || err);
    }
}

export async function getDB() {
    if (!db) await initDB();
    return db;
}
