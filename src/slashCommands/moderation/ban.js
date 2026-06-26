import { PermissionsBitField } from "discord.js";
import { safeRespond, parseDurationToMs } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings } from "../../utils/database.js";
import { slashBan } from "../../utils/slashModeration.js";

const MAX_TEMPBAN_MS = 365 * 24 * 60 * 60 * 1000;

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.BanMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.BanMembers],
    },
    data: {
        name: "ban",
        description: "Ban a user, optionally for a limited time (auto-unban)",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.BanMembers.toString(),
        options: [
            { name: "user", description: "User to ban", type: 6, required: true },
            { name: "reason", description: "Reason for the ban", type: 3, required: false },
            { name: "duration", description: "Temp-ban length (e.g. 1h, 7d). Leave empty for permanent.", type: 3, required: false },
            {
                name: "delete_days", description: "Days of their messages to delete (0–7)", type: 4, required: false,
                choices: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: String(n), value: n })),
            },
        ],
    },
    async execute(i) {
        const user = i.options.getUser("user");
        const settings = getGuildSettings(i.guildId);
        const reason = i.options.getString("reason") || settings.moderation.defaultReason;
        const durationStr = i.options.getString("duration");
        const deleteDays = i.options.getInteger("delete_days") ?? settings.moderation.defaultBanDeleteDays ?? 0;

        if (settings.moderation.requireReason && !i.options.getString("reason")) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Reason Required", description: "This server requires a reason for moderation actions.", ephemeral: true }));
        }

        let durationMs = null;
        if (durationStr) {
            durationMs = parseDurationToMs(durationStr);
            if (!durationMs || durationMs <= 0) {
                return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Invalid Duration", description: "Use formats like `30m`, `2h`, `7d`. Omit for a permanent ban.", ephemeral: true }));
            }
            if (durationMs > MAX_TEMPBAN_MS) {
                return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Too Long", description: "Temp-bans cannot exceed **1 year**.", ephemeral: true }));
            }
        }

        await i.deferReply();
        return slashBan(i, user, reason, { deleteDays, durationMs });
    },
};
