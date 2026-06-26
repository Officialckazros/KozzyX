import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings } from "../../utils/database.js";
import { slashSoftban } from "../../utils/slashModeration.js";

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.BanMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.BanMembers],
    },
    data: {
        name: "softban",
        description: "Ban then immediately unban to purge a user's recent messages",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.BanMembers.toString(),
        options: [
            { name: "user", description: "User to softban", type: 6, required: true },
            { name: "reason", description: "Reason for the softban", type: 3, required: false },
        ],
    },
    async execute(i) {
        const user = i.options.getUser("user");
        const settings = getGuildSettings(i.guildId);
        const reason = i.options.getString("reason") || settings.moderation.defaultReason;

        if (settings.moderation.requireReason && !i.options.getString("reason")) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Reason Required", description: "This server requires a reason for moderation actions.", ephemeral: true }));
        }

        await i.deferReply();
        return slashSoftban(i, user, reason);
    },
};
