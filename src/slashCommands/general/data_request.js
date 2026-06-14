import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { collectGuildDataSummary } from "../../utils/guildData.js";

export default {
    data: {
        name: "data_request",
        description: "Server owner only: see exactly what data the bot stores about this server.",
        default_member_permissions: String(PermissionsBitField.Flags.Administrator),
        dm_permission: false,
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

        await interaction.deferReply({ ephemeral: true });

        let summary;
        try {
            summary = await collectGuildDataSummary(guild);
        } catch (err) {
            console.error("[data_request] failed:", err);
            return safeRespond(interaction, asEmbedPayload({
                guildId: guild.id, type: "error",
                title: "Data request failed",
                description: "Something went wrong while collecting the data summary. Please try again.",
                ephemeral: true,
            }));
        }

        const total = summary.reduce((sum, r) => sum + r.count, 0);
        const lines = summary.map(r => `${r.count > 0 ? "•" : "◦"} **${r.label}:** ${r.count}`);

        const description = total === 0
            ? "**Nothing is stored.** The bot currently holds no data for this server."
            : `The bot stores **${total}** record(s) for this server, broken down below.\n\n${lines.join("\n")}`;

        return safeRespond(interaction, asEmbedPayload({
            guildId: guild.id,
            type: "info",
            title: "Stored Data for This Server",
            description,
            fields: total > 0 ? [{
                name: "​",
                value: "This is a count of what's stored — not the raw contents. To erase all of it permanently, use `/data_deletion_request`.",
            }] : [],
            ephemeral: true,
        }));
    },
};
