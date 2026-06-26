import { PermissionsBitField } from "discord.js";
import { safeRespond, parseDurationToMs } from "../../utils/helpers.js";
import { asEmbedPayload, buildCoolEmbed } from "../../utils/embeds.js";

const MAX_SLOWMODE = 21600;

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageChannels],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageChannels],
    },
    data: {
        name: "slowmode",
        description: "Set per-user slowmode on a channel",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageChannels.toString(),
        options: [
            { name: "duration", description: "Slowmode (e.g. 30, 2m, 1h, off)", type: 3, required: true },
            { name: "channel", description: "Channel (defaults to current)", type: 7, required: false, channel_types: [0, 5, 11, 12] },
        ],
    },
    async execute(i) {
        const channel = i.options.getChannel("channel") || i.channel;
        const durationStr = i.options.getString("duration");

        if (!channel?.isTextBased?.()) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid Channel", description: "Slowmode can only be set on text channels.", ephemeral: true }));
        }

        let seconds = 0;
        if (!["off", "0", "disable", "none"].includes(durationStr.toLowerCase())) {
            const ms = parseDurationToMs(durationStr);
            seconds = ms !== null && ms > 0 ? Math.floor(ms / 1000) : parseInt(durationStr, 10);
            if (!Number.isFinite(seconds) || seconds < 0) {
                return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid", description: "Provide a valid number of seconds or a duration like `2m`.", ephemeral: true }));
            }
            if (seconds > MAX_SLOWMODE) {
                return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Too High", description: `Slowmode cannot exceed **${MAX_SLOWMODE}s** (6 hours).`, ephemeral: true }));
            }
        }

        try {
            await channel.setRateLimitPerUser(seconds, `Changed by ${i.user.tag}`);
        } catch {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Failed", description: "I don't have permission to set slowmode there.", ephemeral: true }));
        }

        const embed = buildCoolEmbed({
            guildId: i.guildId, type: "settings", title: "Slowmode Updated",
            fields: [
                { name: "Channel", value: `${channel}`, inline: true },
                { name: "Slowmode", value: seconds === 0 ? "**Disabled**" : `**${seconds}s**`, inline: true },
                { name: "Moderator", value: `${i.user}`, inline: true },
            ],
            showFooter: true, footerText: i.guild.name,
        });
        return safeRespond(i, { embeds: [embed] });
    },
};
