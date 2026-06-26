import { PermissionsBitField } from "discord.js";
import { safeRespond, parseDurationToMs } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings } from "../../utils/database.js";
import { slashTimeout } from "../../utils/slashModeration.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ModerateMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.ModerateMembers],
    },
    data: {
        name: "timeout",
        description: "Temporarily mute (timeout) a member",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ModerateMembers.toString(),
        options: [
            { name: "user", description: "Member to time out", type: 6, required: true },
            { name: "duration", description: "Length (e.g. 10m, 2h, 1d). Max 28d.", type: 3, required: true },
            { name: "reason", description: "Reason for the timeout", type: 3, required: false },
        ],
    },
    async execute(i) {
        const member = i.options.getMember("user");
        const settings = getGuildSettings(i.guildId);
        const reason = i.options.getString("reason") || settings.moderation.defaultReason;
        const durationStr = i.options.getString("duration");

        if (!member) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Not a Member", description: "That user is not in this server.", ephemeral: true }));
        }
        if (settings.moderation.requireReason && !i.options.getString("reason")) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Reason Required", description: "This server requires a reason for moderation actions.", ephemeral: true }));
        }

        const ms = parseDurationToMs(durationStr);
        if (!ms || ms <= 0) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid Duration", description: "Use formats like `10m`, `2h`, `1d`.", ephemeral: true }));
        }
        if (ms > MAX_TIMEOUT_MS) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Too Long", description: "Timeouts cannot exceed **28 days** (Discord limit).", ephemeral: true }));
        }

        await i.deferReply();
        return slashTimeout(i, member, ms, reason);
    },
};
