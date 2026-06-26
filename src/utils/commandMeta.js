import { PermissionsBitField } from "discord.js";

const CONFIG_PREFIX = "!";
const MOD_PREFIX = ",";
const DEFAULT_COOLDOWN_SECONDS = 3;
const CATEGORY_LABELS = {
    general: "General",
    fun: "Fun",
    moderation: "Moderation",
    config: "Configuration",
    features: "Features",
};

const PREFIX_DEFAULTS = {
    moderation: { prefix: MOD_PREFIX },
    config: {
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
        prefix: CONFIG_PREFIX,
        config: true,
    },
    features: { prefix: MOD_PREFIX },
    fun: { prefix: MOD_PREFIX },
};

const PREFIX_PERMISSION_OVERRIDES = {
    audit: [PermissionsBitField.Flags.ViewAuditLog],
    ban: [PermissionsBitField.Flags.BanMembers],
    banraid: [PermissionsBitField.Flags.BanMembers],
    clear: [PermissionsBitField.Flags.ManageMessages],
    clearwarns: [PermissionsBitField.Flags.ModerateMembers],
    damage: [PermissionsBitField.Flags.ModerateMembers],
    heal: [PermissionsBitField.Flags.ModerateMembers],
    kick: [PermissionsBitField.Flags.KickMembers],
    lock: [PermissionsBitField.Flags.ManageChannels],
    nick: [PermissionsBitField.Flags.ManageNicknames],
    nicklock: [PermissionsBitField.Flags.ManageNicknames],
    nickunlock: [PermissionsBitField.Flags.ManageNicknames],
    raidlist: [PermissionsBitField.Flags.BanMembers],
    slowmode: [PermissionsBitField.Flags.ManageChannels],
    softban: [PermissionsBitField.Flags.BanMembers],
    unlock: [PermissionsBitField.Flags.ManageChannels],
    unraid: [PermissionsBitField.Flags.Administrator],
    warn: [PermissionsBitField.Flags.ModerateMembers],
    warnthreshold: [PermissionsBitField.Flags.ModerateMembers],
    autoresponder: [PermissionsBitField.Flags.ManageMessages],
};

const SLASH_PERMISSION_OVERRIDES = {
    data_deletion_request: [PermissionsBitField.Flags.Administrator],
    data_request: [PermissionsBitField.Flags.Administrator],
    generate_rules: [PermissionsBitField.Flags.ManageGuild],
    nuke: [PermissionsBitField.Flags.ManageMessages],
    plugins: [PermissionsBitField.Flags.ManageGuild],
    redo_server_setup: [PermissionsBitField.Flags.ManageGuild],
    "server_setup": [PermissionsBitField.Flags.ManageGuild],
    "slavic-response": [PermissionsBitField.Flags.ManageGuild],
    vc: [],
    wipe_server: [PermissionsBitField.Flags.Administrator],
};

function toPermissionArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "bigint") return [value];
    if (typeof value === "string") {
        try {
            const bitfield = new PermissionsBitField(BigInt(value));
            return bitfield.toArray().map((name) => PermissionsBitField.Flags[name]).filter(Boolean);
        } catch {
            return [];
        }
    }
    return [];
}

export function categoryFromPath(relativePath) {
    return relativePath?.split(/[\\/]/)[0] || "general";
}

export function categoryLabel(category) {
    return CATEGORY_LABELS[category] || category?.replace(/[-_]/g, " ") || "Other";
}

export function normalizeCommandMeta({ command, kind, relativePath }) {
    const category = command.meta?.category || categoryFromPath(relativePath);
    const name = kind === "slash" ? command.data?.name : command.name;
    const defaults = kind === "prefix" ? (PREFIX_DEFAULTS[category] || { prefix: MOD_PREFIX }) : {};
    const permissionOverride = kind === "prefix"
        ? PREFIX_PERMISSION_OVERRIDES[name]
        : SLASH_PERMISSION_OVERRIDES[name];
    const dataPermissions = toPermissionArray(command.data?.default_member_permissions);

    const requiredUserPermissions = command.meta?.requiredUserPermissions
        ?? permissionOverride
        ?? (dataPermissions.length ? dataPermissions : undefined)
        ?? defaults.requiredUserPermissions
        ?? [];

    const meta = {
        name,
        kind,
        category,
        categoryLabel: categoryLabel(category),
        description: command.meta?.description || command.data?.description || command.description || "No description provided.",
        usage: command.meta?.usage || (kind === "prefix" ? `${defaults.prefix || MOD_PREFIX}${name}` : `/${name}`),
        examples: command.meta?.examples || [],
        aliases: command.aliases || command.meta?.aliases || [],
        requiredUserPermissions,
        requiredBotPermissions: command.meta?.requiredBotPermissions || [],
        cooldownSeconds: command.meta?.cooldownSeconds ?? command.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS,
        guildOnly: command.meta?.guildOnly ?? (command.data?.dm_permission === false || kind === "prefix"),
        config: command.config ?? defaults.config ?? false,
        dangerLevel: command.meta?.dangerLevel || "normal",
    };

    command.meta = meta;
    return meta;
}

export function formatPermissionNames(permissions = []) {
    const bitfield = new PermissionsBitField(permissions);
    return bitfield.toArray().map((name) => name.replace(/([A-Z])/g, " $1").trim()).join(", ");
}

export function commandMention(meta) {
    return meta.kind === "slash" ? `/${meta.name}` : meta.usage;
}
