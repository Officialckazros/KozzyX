import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { collectGuildDataSummary, purgeGuildData } from "../../utils/guildData.js";

export default {
    data: {
        name: "data_deletion_request",
        description: "Server owner only: permanently delete EVERYTHING the bot has stored about this server.",
        default_member_permissions: String(PermissionsBitField.Flags.Administrator),
        dm_permission: false,
        options: [
            {
                name: "reason",
                description: "Why you're requesting deletion (for your own records).",
                type: 3,
                required: true,
            },
            {
                name: "confirm",
                description: "Type the exact server name to confirm. This cannot be undone.",
                type: 3,
                required: true,
            },
        ],
    },

    async execute(interaction) {
        if (!interaction.guildId) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: null, type: "error",
                title: "Server only",
                description: "This command can only be used inside a server.",
                ephemeral: true,
            }));
        }

        const guild = interaction.guild
            || await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
        if (!guild) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: null, type: "error",
                title: "Cannot access server",
                description: "I couldn't load this server.",
                ephemeral: true,
            }));
        }

        if (interaction.user.id !== guild.ownerId) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: guild.id, type: "error",
                title: "Restricted to the server owner",
                description: "Only the **server owner** can run this command.",
                ephemeral: true,
            }));
        }

        const reason = interaction.options.getString("reason");
        const confirm = interaction.options.getString("confirm");

        if (confirm !== guild.name) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: guild.id, type: "error",
                title: "Confirmation failed",
                description: `To confirm, the \`confirm\` option must exactly match this server's name.\n\nYou typed \`${confirm}\` but the server name is \`${guild.name}\`.\n\n**No data was deleted.**`,
                ephemeral: true,
            }));
        }

        await interaction.deferReply({ ephemeral: true });

        // Snapshot before-counts so the receipt reflects what was actually held.
        let before = [];
        try { before = await collectGuildDataSummary(guild); } catch { /* non-fatal */ }
        const beforeTotal = before.reduce((sum, r) => sum + r.count, 0);

        let result;
        try {
            result = await purgeGuildData(guild);
        } catch (err) {
            console.error("[data_deletion_request] failed:", err);
            return safeRespond(interaction, asEmbedPayload({
                guildId: guild.id, type: "error",
                title: "Deletion failed",
                description: "Something went wrong during deletion and it was rolled back. No partial deletion occurred. Please try again.",
                ephemeral: true,
            }));
        }

        const deletedLines = Object.entries(result.deleted)
            .filter(([, count]) => count > 0)
            .map(([label, count]) => `• **${label}:** ${count}`);

        const description = result.total === 0
            ? "There was no stored data for this server. Nothing needed to be deleted."
            : `Permanently erased **${result.total}** record(s) across all storage (database, in-memory caches, and the dashboard feed). This is irreversible.`;

        return safeRespond(interaction, asEmbedPayload({
            guildId: guild.id,
            type: "success",
            title: "Data Deletion Completed",
            description,
            fields: [
                { name: "Reason", value: reason.slice(0, 1024) },
                ...(deletedLines.length ? [{ name: "Deleted", value: deletedLines.join("\n").slice(0, 1024) }] : []),
                ...(result.total === 0 && beforeTotal > 0
                    ? [{ name: "Note", value: "Records were cleared from caches only." }]
                    : []),
            ],
            ephemeral: true,
        }));
    },
};
