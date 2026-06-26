import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload, buildCoolEmbed, postCase } from "../../utils/embeds.js";

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageChannels],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageChannels],
    },
    data: {
        name: "lock",
        description: "Lock a channel so @everyone cannot send messages",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageChannels.toString(),
        options: [
            { name: "channel", description: "Channel to lock (defaults to current)", type: 7, required: false, channel_types: [0, 5, 11, 12] },
            { name: "reason", description: "Reason", type: 3, required: false },
        ],
    },
    async execute(i) {
        const channel = i.options.getChannel("channel") || i.channel;
        const reason = i.options.getString("reason") || "No reason provided.";

        if (!channel?.isTextBased?.()) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid Channel", description: "Lock can only be used on text channels.", ephemeral: true }));
        }

        const everyone = i.guild.roles.everyone;
        const current = channel.permissionsFor(everyone);
        if (current && !current.has(PermissionsBitField.Flags.SendMessages)) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "Already Locked", description: `${channel} is already locked for @everyone.`, ephemeral: true }));
        }

        try {
            await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `Locked by ${i.user.tag}: ${reason}` });
        } catch {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Lock Failed", description: "I don't have permission to edit that channel.", ephemeral: true }));
        }

        const embed = buildCoolEmbed({
            guildId: i.guildId, type: "mod", title: "Channel Locked",
            fields: [
                { name: "Channel", value: `${channel}`, inline: true },
                { name: "Moderator", value: `${i.user}`, inline: true },
                { name: "Reason", value: reason, inline: false },
            ],
            showFooter: true, footerText: i.guild.name,
        });
        await safeRespond(i, { embeds: [embed] });
        await postCase(i.guild, embed, i.channelId);
    },
};
