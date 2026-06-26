import { PermissionsBitField } from "discord.js";
import { replyEmbed } from "../../utils/embeds.js";
import { parseDurationToMs } from "../../utils/helpers.js";
import { getGuildSettings, saveSettings } from "../../utils/database.js";
import { buildVerifyPanel } from "../../utils/verification.js";
import { formatDuration } from "../../utils/moderationUtils.js";

export default {
    name: "verification",
    aliases: ["verify"],
    meta: {
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageRoles],
    },
    async execute(message, args) {
        const sub = (args[0] || "").toLowerCase();
        const settings = getGuildSettings(message.guild.id);
        const v = settings.verification;

        if (sub === "status") {
            return replyEmbed(message, {
                type: "info", title: "Verification",
                description: [
                    `**Enabled:** ${v.enabled ? "Yes" : "No"}`,
                    `**Role:** ${v.roleId ? `<@&${v.roleId}>` : "—"}`,
                    `**Channel:** ${v.channelId ? `<#${v.channelId}>` : "—"}`,
                    `**Min account age:** ${v.minAccountAgeMs > 0 ? formatDuration(v.minAccountAgeMs) : "None"}`,
                ].join("\n"),
            });
        }

        if (sub === "disable") {
            v.enabled = false;
            await saveSettings();
            return replyEmbed(message, { type: "success", title: "Verification Disabled", description: "The verify button will no longer grant roles." });
        }

        if (sub === "setup") {
            const channel = message.mentions.channels.first();
            const role = message.mentions.roles.first();
            if (!channel?.isTextBased?.() || !role) {
                return replyEmbed(message, { type: "error", title: "Usage", description: "`,verification setup #channel @role [minAge]`\nExample: `,verification setup #verify @Member 7d`" });
            }
            if (role.managed || role.id === message.guild.id) return replyEmbed(message, { type: "error", title: "Invalid Role", description: "That role can't be used for verification." });

            const me = message.guild.members.me;
            if (me.roles.highest.position <= role.position) return replyEmbed(message, { type: "error", title: "Role Too High", description: `**${role.name}** is above my highest role, so I can't assign it.` });

            const ageToken = args.find((a) => /^\d+[smhd]$/i.test(a));
            if (ageToken) {
                const parsed = parseDurationToMs(ageToken);
                if (parsed !== null) v.minAccountAgeMs = parsed;
            }

            v.enabled = true;
            v.channelId = channel.id;
            v.roleId = role.id;

            const panel = buildVerifyPanel(message.guild.id);
            const msg = await channel.send(panel).catch(() => null);
            if (!msg) return replyEmbed(message, { type: "error", title: "Failed", description: "I couldn't post in that channel." });
            v.messageId = msg.id;
            await saveSettings();

            return replyEmbed(message, { type: "success", title: "Verification Set Up", description: `Posted the panel in ${channel}. Members who verify get ${role}.` });
        }

        return replyEmbed(message, { type: "error", title: "Usage", description: "`,verification setup #channel @role [minAge]`\n`,verification disable`\n`,verification status`" });
    },
};
