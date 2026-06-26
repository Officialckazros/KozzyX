import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default {
    meta: {
        category: "moderation",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageMessages],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageMessages],
    },
    data: {
        name: "purge",
        description: "Bulk-delete recent messages, optionally only from one user",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageMessages.toString(),
        options: [
            { name: "amount", description: "How many messages (1–100)", type: 4, required: true, min_value: 1, max_value: 100 },
            { name: "user", description: "Only delete messages from this user", type: 6, required: false },
        ],
    },
    async execute(i) {
        const amount = i.options.getInteger("amount");
        const filterUser = i.options.getUser("user");

        await i.deferReply({ flags: 64 });

        try {
            let deleted = 0;
            const cutoff = Date.now() - FOURTEEN_DAYS_MS;

            if (filterUser) {
                const fetched = await i.channel.messages.fetch({ limit: 100 });
                const targets = fetched
                    .filter((m) => m.author.id === filterUser.id && m.createdTimestamp > cutoff)
                    .first(amount);
                if (targets.length) {
                    const result = await i.channel.bulkDelete(targets, true);
                    deleted = result.size;
                }
            } else {
                const result = await i.channel.bulkDelete(amount, true);
                deleted = result.size;
            }

            return safeRespond(i, asEmbedPayload({
                guildId: i.guildId, type: "success", title: "Messages Cleared",
                description: filterUser
                    ? `Cleared **${deleted}** message(s) from ${filterUser}.`
                    : `Cleared **${deleted}** message(s).`,
                ephemeral: true,
            }));
        } catch (err) {
            console.error("[purge] error:", err);
            return safeRespond(i, asEmbedPayload({
                guildId: i.guildId, type: "error", title: "Purge Failed",
                description: "Failed to clear messages. Discord won't bulk-delete messages older than 14 days.",
                ephemeral: true,
            }));
        }
    },
};
