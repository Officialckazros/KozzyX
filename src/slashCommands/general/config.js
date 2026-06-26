import { PermissionsBitField } from "discord.js";
import { safeRespond, parseHexColorToInt } from "../../utils/helpers.js";
import { asEmbedPayload, buildCoolEmbed } from "../../utils/embeds.js";
import { getGuildSettings, saveSettings } from "../../utils/database.js";

const COLOR_KEYS = ["info", "success", "warning", "error", "ticket", "mod", "case", "afk", "autoresponder", "settings"];

function ok(i, title, description) {
    return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title, description, ephemeral: true }));
}
function bad(i, title, description) {
    return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title, description, ephemeral: true }));
}

function channelSetSub(name, label) {
    return {
        name: "set", description: `Configure ${label} messages`, type: 1,
        options: [
            { name: "enabled", description: "Turn this on or off", type: 5, required: false },
            { name: "channel", description: "Channel to post in", type: 7, required: false, channel_types: [0, 5] },
            { name: "message", description: "Message text. Placeholders: {user} {username} {server}", type: 3, required: false },
        ],
    };
}

export default {
    meta: {
        category: "general",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
    },
    data: {
        name: "config",
        description: "Customize the bot's behavior for this server",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
        options: [
            { name: "welcome", description: "Welcome message settings", type: 2, options: [channelSetSub("welcome", "welcome")] },
            { name: "goodbye", description: "Goodbye message settings", type: 2, options: [channelSetSub("goodbye", "goodbye")] },
            {
                name: "moderation", description: "Moderation defaults", type: 2, options: [{
                    name: "set", description: "Configure moderation defaults", type: 1,
                    options: [
                        { name: "dm_on_action", description: "DM users when they're punished", type: 5, required: false },
                        { name: "require_reason", description: "Require a reason on mod commands", type: 5, required: false },
                        { name: "log_channel", description: "Extra channel to log mod actions", type: 7, required: false, channel_types: [0, 5] },
                        { name: "default_ban_delete_days", description: "Default days of messages to delete on ban (0–7)", type: 4, required: false, min_value: 0, max_value: 7 },
                        { name: "default_reason", description: "Default reason text", type: 3, required: false },
                    ],
                }],
            },
            {
                name: "giveaway", description: "Giveaway defaults", type: 2, options: [{
                    name: "set", description: "Configure giveaway defaults", type: 1,
                    options: [
                        { name: "default_winners", description: "Default number of winners", type: 4, required: false, min_value: 1, max_value: 50 },
                        { name: "required_role", description: "Default required role to enter", type: 8, required: false },
                        { name: "emoji", description: "Entry button emoji", type: 3, required: false },
                        { name: "host_mention", description: "Show the host in the giveaway embed", type: 5, required: false },
                    ],
                }],
            },
            {
                name: "colors", description: "Embed colors", type: 2, options: [{
                    name: "set", description: "Set an embed color", type: 1,
                    options: [
                        { name: "type", description: "Which embed type", type: 3, required: true, choices: COLOR_KEYS.map((k) => ({ name: k, value: k })) },
                        { name: "hex", description: "Hex color, e.g. 5865F2", type: 3, required: true },
                    ],
                }],
            },
            { name: "view", description: "Show the current configuration", type: 1 },
        ],
    },
    async execute(i) {
        const group = i.options.getSubcommandGroup(false);
        const settings = getGuildSettings(i.guildId);

        if (!group && i.options.getSubcommand() === "view") {
            const s = settings;
            const onOff = (b) => (b ? "On" : "Off");
            const embed = buildCoolEmbed({
                guildId: i.guildId, type: "settings", title: "Server Configuration",
                fields: [
                    { name: "Welcome", value: `${onOff(s.welcome.enabled)} · ${s.welcome.channelId ? `<#${s.welcome.channelId}>` : "no channel"}`, inline: true },
                    { name: "Goodbye", value: `${onOff(s.goodbye.enabled)} · ${s.goodbye.channelId ? `<#${s.goodbye.channelId}>` : "no channel"}`, inline: true },
                    { name: "Verification", value: `${onOff(s.verification.enabled)} · ${s.verification.roleId ? `<@&${s.verification.roleId}>` : "no role"}`, inline: true },
                    { name: "Mod DMs", value: onOff(s.moderation.dmOnAction), inline: true },
                    { name: "Require Reason", value: onOff(s.moderation.requireReason), inline: true },
                    { name: "Mod Log", value: s.moderation.logChannelId ? `<#${s.moderation.logChannelId}>` : "—", inline: true },
                    { name: "Case Channel", value: s.caseChannelId ? `<#${s.caseChannelId}>` : "—", inline: true },
                    { name: "Giveaway Winners", value: String(s.giveaway.defaultWinners), inline: true },
                    { name: "Giveaway Role", value: s.giveaway.requiredRoleId ? `<@&${s.giveaway.requiredRoleId}>` : "—", inline: true },
                ],
                showFooter: true, footerText: i.guild.name,
            });
            return safeRespond(i, { embeds: [embed], flags: 64 });
        }

        if (group === "welcome" || group === "goodbye") {
            const block = settings[group];
            const enabled = i.options.getBoolean("enabled");
            const channel = i.options.getChannel("channel");
            const message = i.options.getString("message");
            if (enabled === null && !channel && !message) return bad(i, "Nothing to Change", "Provide at least one option to update.");
            if (enabled !== null) block.enabled = enabled;
            if (channel) block.channelId = channel.id;
            if (message) block.message = message.slice(0, 2000);
            await saveSettings();
            return ok(i, `${group === "welcome" ? "Welcome" : "Goodbye"} Updated`, `Enabled: **${block.enabled ? "Yes" : "No"}**\nChannel: ${block.channelId ? `<#${block.channelId}>` : "—"}\nMessage: ${block.message}`);
        }

        if (group === "moderation") {
            const m = settings.moderation;
            const dm = i.options.getBoolean("dm_on_action");
            const rr = i.options.getBoolean("require_reason");
            const log = i.options.getChannel("log_channel");
            const days = i.options.getInteger("default_ban_delete_days");
            const reason = i.options.getString("default_reason");
            if (dm !== null) m.dmOnAction = dm;
            if (rr !== null) m.requireReason = rr;
            if (log) m.logChannelId = log.id;
            if (days !== null) m.defaultBanDeleteDays = days;
            if (reason) m.defaultReason = reason.slice(0, 400);
            await saveSettings();
            return ok(i, "Moderation Updated", `DM on action: **${m.dmOnAction ? "Yes" : "No"}**\nRequire reason: **${m.requireReason ? "Yes" : "No"}**\nMod log: ${m.logChannelId ? `<#${m.logChannelId}>` : "—"}\nBan delete days: **${m.defaultBanDeleteDays}**`);
        }

        if (group === "giveaway") {
            const g = settings.giveaway;
            const winners = i.options.getInteger("default_winners");
            const role = i.options.getRole("required_role");
            const emoji = i.options.getString("emoji");
            const hostMention = i.options.getBoolean("host_mention");
            if (winners !== null) g.defaultWinners = winners;
            if (role) g.requiredRoleId = role.id;
            if (emoji) g.emoji = emoji.slice(0, 64);
            if (hostMention !== null) g.hostMention = hostMention;
            await saveSettings();
            return ok(i, "Giveaway Defaults Updated", `Winners: **${g.defaultWinners}**\nRequired role: ${g.requiredRoleId ? `<@&${g.requiredRoleId}>` : "—"}\nEmoji: ${g.emoji}\nShow host: **${g.hostMention ? "Yes" : "No"}**`);
        }

        if (group === "colors") {
            const type = i.options.getString("type");
            const hex = i.options.getString("hex");
            const value = parseHexColorToInt(hex);
            if (value === null) return bad(i, "Invalid Color", "Provide a 6-digit hex color like `5865F2`.");
            settings.embedColors[type] = value;
            await saveSettings();
            return ok(i, "Color Updated", `Set **${type}** embeds to \`#${hex.replace(/^#/, "").toUpperCase()}\`.`);
        }

        return bad(i, "Unknown", "Unrecognized config command.");
    },
};
