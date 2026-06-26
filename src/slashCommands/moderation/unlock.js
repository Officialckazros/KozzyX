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
        name: "unlock",
        description: "Unlock a previously locked channel",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageChannels.toString(),
        options: [
            { name: "channel", description: "Channel to unlock (defaults to current)", type: 7, required: false, channel_types: [0, 5, 11, 12] },
            { name: "reason", description: "Reason", type: 3, required: false },
        ],
    },
    async execute(i) {
        const channel = i.options.getChannel("channel") || i.channel;
        const reason = i.options.getString("reason") || "No reason provided.";

        if (!channel?.isTextBased?.()) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid Channel", description: "Unlock can only be used on text channels.", ephemeral: true }));
        }

        const everyone = i.guild.roles.everyone;
        try {
            await channel.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: `Unlocked by ${i.user.tag}: ${reason}` });
        } catch {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Unlock Failed", description: "I don't have permission to edit that channel.", ephemeral: true }));
        }

        const embed = buildCoolEmbed({
            guildId: i.guildId, type: "success", title: "Channel Unlocked",
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
