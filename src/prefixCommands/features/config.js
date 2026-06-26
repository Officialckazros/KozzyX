import { PermissionsBitField } from "discord.js";
import { replyEmbed, buildCoolEmbed } from "../../utils/embeds.js";
import { parseHexColorToInt } from "../../utils/helpers.js";
import { getGuildSettings, saveSettings } from "../../utils/database.js";

const COLOR_KEYS = ["info", "success", "warning", "error", "ticket", "mod", "case", "afk", "autoresponder", "settings"];

function onoff(token) {
    if (["on", "enable", "enabled", "true", "yes"].includes(token)) return true;
    if (["off", "disable", "disabled", "false", "no"].includes(token)) return false;
    return null;
}

export default {
    name: "config",
    aliases: ["settings"],
    meta: { requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild] },
    async execute(message, args) {
        const sub = (args[0] || "").toLowerCase();
        const s = getGuildSettings(message.guild.id);

        if (!sub || sub === "view") {
            const oo = (b) => (b ? "On" : "Off");
            const embed = buildCoolEmbed({
                guildId: message.guild.id, type: "settings", title: "Server Configuration",
                fields: [
                    { name: "Welcome", value: `${oo(s.welcome.enabled)} · ${s.welcome.channelId ? `<#${s.welcome.channelId}>` : "no channel"}`, inline: true },
                    { name: "Goodbye", value: `${oo(s.goodbye.enabled)} · ${s.goodbye.channelId ? `<#${s.goodbye.channelId}>` : "no channel"}`, inline: true },
                    { name: "Verification", value: `${oo(s.verification.enabled)} · ${s.verification.roleId ? `<@&${s.verification.roleId}>` : "no role"}`, inline: true },
                    { name: "Mod DMs", value: oo(s.moderation.dmOnAction), inline: true },
                    { name: "Require Reason", value: oo(s.moderation.requireReason), inline: true },
                    { name: "Mod Log", value: s.moderation.logChannelId ? `<#${s.moderation.logChannelId}>` : "-", inline: true },
                    { name: "Giveaway Winners", value: String(s.giveaway.defaultWinners), inline: true },
                    { name: "Giveaway Role", value: s.giveaway.requiredRoleId ? `<@&${s.giveaway.requiredRoleId}>` : "-", inline: true },
                ],
                showFooter: true, footerText: message.guild.name,
            });
            return message.reply({ embeds: [embed] });
        }

        if (sub === "welcome" || sub === "goodbye") {
            const block = s[sub];
            const state = onoff((args[1] || "").toLowerCase());
            const channel = message.mentions.channels.first();

            let rest = args.slice(1);
            if (state !== null) rest = rest.slice(1);
            rest = rest.filter((a) => !/^<#\d+>$/.test(a));
            const text = rest.join(" ").trim();

            if (state === null && !channel && !text) {
                return replyEmbed(message, { type: "error", title: "Usage", description: `\`,config ${sub} <on|off> [#channel] [message]\`\nPlaceholders: {user} {username} {server}` });
            }
            if (state !== null) block.enabled = state;
            if (channel) block.channelId = channel.id;
            if (text) block.message = text.slice(0, 2000);
            await saveSettings();
            return replyEmbed(message, { type: "success", title: `${sub === "welcome" ? "Welcome" : "Goodbye"} Updated`, description: `Enabled: **${block.enabled ? "Yes" : "No"}**\nChannel: ${block.channelId ? `<#${block.channelId}>` : "-"}\nMessage: ${block.message}` });
        }

        if (sub === "color" || sub === "colour") {
            const type = (args[1] || "").toLowerCase();
            const hex = args[2];
            if (!COLOR_KEYS.includes(type) || !hex) {
                return replyEmbed(message, { type: "error", title: "Usage", description: `\`,config color <type> <hex>\`\nTypes: ${COLOR_KEYS.join(", ")}` });
            }
            const val = parseHexColorToInt(hex);
            if (val === null) return replyEmbed(message, { type: "error", title: "Invalid Color", description: "Provide a 6-digit hex like `5865F2`." });
            s.embedColors[type] = val;
            await saveSettings();
            return replyEmbed(message, { type: "success", title: "Color Updated", description: `Set **${type}** embeds to \`#${hex.replace(/^#/, "").toUpperCase()}\`.` });
        }

        if (sub === "mod" || sub === "moderation") {
            const key = (args[1] || "").toLowerCase();
            const m = s.moderation;
            if (key === "dm") {
                const v = onoff((args[2] || "").toLowerCase());
                if (v === null) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config mod dm <on|off>`" });
                m.dmOnAction = v;
            } else if (key === "reason") {
                const v = onoff((args[2] || "").toLowerCase());
                if (v === null) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config mod reason <on|off>`" });
                m.requireReason = v;
            } else if (key === "log") {
                const channel = message.mentions.channels.first();
                if (!channel) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config mod log #channel`" });
                m.logChannelId = channel.id;
            } else {
                return replyEmbed(message, { type: "error", title: "Usage", description: "`,config mod dm <on|off>`\n`,config mod reason <on|off>`\n`,config mod log #channel`" });
            }
            await saveSettings();
            return replyEmbed(message, { type: "success", title: "Moderation Updated", description: `DM on action: **${m.dmOnAction ? "Yes" : "No"}**\nRequire reason: **${m.requireReason ? "Yes" : "No"}**\nMod log: ${m.logChannelId ? `<#${m.logChannelId}>` : "-"}` });
        }

        if (sub === "giveaway") {
            const key = (args[1] || "").toLowerCase();
            const g = s.giveaway;
            if (key === "winners") {
                const n = parseInt(args[2], 10);
                if (!Number.isFinite(n) || n < 1 || n > 50) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config giveaway winners <1-50>`" });
                g.defaultWinners = n;
            } else if (key === "role") {
                const role = message.mentions.roles.first();
                if (!role) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config giveaway role @role`" });
                g.requiredRoleId = role.id;
            } else if (key === "emoji") {
                if (!args[2]) return replyEmbed(message, { type: "error", title: "Usage", description: "`,config giveaway emoji <emoji>`" });
                g.emoji = args[2].slice(0, 64);
            } else {
                return replyEmbed(message, { type: "error", title: "Usage", description: "`,config giveaway winners <n>`\n`,config giveaway role @role`\n`,config giveaway emoji <emoji>`" });
            }
            await saveSettings();
            return replyEmbed(message, { type: "success", title: "Giveaway Defaults Updated", description: `Winners: **${g.defaultWinners}**\nRequired role: ${g.requiredRoleId ? `<@&${g.requiredRoleId}>` : "-"}\nEmoji: ${g.emoji}` });
        }

        return replyEmbed(message, {
            type: "error", title: "Config",
            description: "`,config view`\n`,config welcome <on|off> [#channel] [message]`\n`,config goodbye <on|off> [#channel] [message]`\n`,config color <type> <hex>`\n`,config mod dm|reason|log ...`\n`,config giveaway winners|role|emoji ...`",
        });
    },
};
