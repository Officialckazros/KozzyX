import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings } from "../../utils/database.js";
import { slashKick } from "../../utils/slashModeration.js";

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.KickMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.KickMembers],
    },
    data: {
        name: "kick",
        description: "Kick a member from the server",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.KickMembers.toString(),
        options: [
            { name: "user", description: "Member to kick", type: 6, required: true },
            { name: "reason", description: "Reason for the kick", type: 3, required: false },
        ],
    },
    async execute(i) {
        const member = i.options.getMember("user");
        const settings = getGuildSettings(i.guildId);
        const reason = i.options.getString("reason") || settings.moderation.defaultReason;

        if (!member) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Not a Member", description: "That user is not in this server.", ephemeral: true }));
        }
        if (settings.moderation.requireReason && !i.options.getString("reason")) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Reason Required", description: "This server requires a reason for moderation actions.", ephemeral: true }));
        }

        await i.deferReply();
        return slashKick(i, member, reason);
    },
};
