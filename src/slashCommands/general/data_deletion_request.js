import {
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload, buildCoolEmbed } from "../../utils/embeds.js";
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

        
        let summary = [];
        try { summary = await collectGuildDataSummary(guild); } catch {  }
        const total = summary.reduce((sum, r) => sum + r.count, 0);

        if (total === 0) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: guild.id, type: "info",
                title: "Nothing to Delete",
                description: "The bot currently holds no data for this server, so there's nothing to erase.",
                ephemeral: true,
            }));
        }

        const breakdown = summary
            .filter(r => r.count > 0)
            .map(r => `• **${r.label}:** ${r.count}`)
            .join("\n");

        const confirmId = `data_del_confirm_${interaction.user.id}_${Date.now()}`;
        const cancelId = `data_del_cancel_${interaction.user.id}_${Date.now()}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(confirmId)
                .setLabel("Permanently Delete Everything")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
        );

        const response = await interaction.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [buildCoolEmbed({
                guildId: guild.id,
                type: "error",
                title: "⚠ Confirm Permanent Data Deletion",
                description:
                    "**This will LITERALLY delete everything the bot has stored about this server.**\n\n" +
                    "Pressing **Permanently Delete Everything** below will erase all of the records listed here from the database, " +
                    "every in-memory cache, the anti-raid state, the invite cache, and the dashboard activity feed. " +
                    "The database is then compacted so the data cannot be recovered.\n\n" +
                    "**This action is irreversible. There is no backup and no undo.**",
                fields: [
                    { name: `Records to be erased — ${total} total`, value: breakdown.slice(0, 1024) },
                    { name: "Reason", value: reason.slice(0, 1024) },
                ],
                showAuthor: false,
                showFooter: true,
                footerText: "This cannot be undone. Confirm within 30 seconds.",
            })],
            components: [row],
            withResponse: true,
        });
        const reply = response.resource?.message ?? response;

        let btn;
        try {
            btn = await reply.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === cancelId),
                time: 30_000,
            });
        } catch {
            return interaction.editReply({
                embeds: [buildCoolEmbed({
                    guildId: guild.id, type: "info",
                    title: "Confirmation Expired",
                    description: "The request timed out — **no data was deleted.** Run the command again if you still want to proceed.",
                })],
                components: [],
            }).catch(() => {});
        }

        if (btn.customId === cancelId) {
            return btn.update({
                embeds: [buildCoolEmbed({
                    guildId: guild.id, type: "info",
                    title: "Deletion Cancelled",
                    description: "Cancelled — **no data was deleted.**",
                })],
                components: [],
            });
        }

        await btn.update({
            embeds: [buildCoolEmbed({
                guildId: guild.id, type: "warning",
                title: "Deleting…",
                description: "Erasing all stored data for this server, please wait.",
            })],
            components: [],
        });

        let result;
        try {
            result = await purgeGuildData(guild);
        } catch (err) {
            console.error("[data_deletion_request] failed:", err);
            return interaction.editReply({
                embeds: [buildCoolEmbed({
                    guildId: guild.id, type: "error",
                    title: "Deletion Failed",
                    description: "Something went wrong during deletion and it was rolled back. No partial deletion occurred — please try again.",
                })],
                components: [],
            }).catch(() => {});
        }

        const deletedLines = Object.entries(result.deleted)
            .filter(([, count]) => count > 0)
            .map(([label, count]) => `• **${label}:** ${count}`);

        return interaction.editReply({
            embeds: [buildCoolEmbed({
                guildId: guild.id,
                type: "success",
                title: "Data Deletion Completed",
                description: `Permanently erased **${result.total}** record(s) across all storage. This is irreversible.`,
                fields: [
                    { name: "Reason", value: reason.slice(0, 1024) },
                    ...(deletedLines.length ? [{ name: "Deleted", value: deletedLines.join("\n").slice(0, 1024) }] : []),
                ],
                showAuthor: false,
                showFooter: true,
                footerText: "Database compacted — this data is not recoverable.",
            })],
            components: [],
        });
    },
};
