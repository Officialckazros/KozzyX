import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings } from "../../utils/database.js";
import { slashWarn, slashWarnRemove } from "../../utils/slashModeration.js";

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ModerateMembers],
    },
    data: {
        name: "warn",
        description: "Warn a member (or remove warnings with the remove option)",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ModerateMembers.toString(),
        options: [
            { name: "user", description: "Member to warn", type: 6, required: true },
            { name: "reason", description: "Reason for the warning", type: 3, required: false },
            { name: "remove", description: "Instead remove this many warnings", type: 4, required: false, min_value: 1, max_value: 100 },
        ],
    },
    async execute(i) {
        const member = i.options.getMember("user");
        if (!member) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Not a Member", description: "That user is not in this server.", ephemeral: true }));
        }

        const remove = i.options.getInteger("remove");
        if (remove) {
            await i.deferReply();
            return slashWarnRemove(i, member, remove);
        }

        const settings = getGuildSettings(i.guildId);
        const reason = i.options.getString("reason") || settings.moderation.defaultReason;
        if (settings.moderation.requireReason && !i.options.getString("reason")) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Reason Required", description: "This server requires a reason for moderation actions.", ephemeral: true }));
        }

        await i.deferReply();
        return slashWarn(i, member, reason);
    },
};
