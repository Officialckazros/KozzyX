import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { slashUntimeout } from "../../utils/slashModeration.js";

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ModerateMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.ModerateMembers],
    },
    data: {
        name: "untimeout",
        description: "Remove a member's timeout early",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ModerateMembers.toString(),
        options: [
            { name: "user", description: "Member to release", type: 6, required: true },
        ],
    },
    async execute(i) {
        const member = i.options.getMember("user");
        if (!member) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Not a Member", description: "That user is not in this server.", ephemeral: true }));
        }
        await i.deferReply();
        return slashUntimeout(i, member);
    },
};
