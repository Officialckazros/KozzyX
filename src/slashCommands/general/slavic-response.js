import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings, saveSettings } from "../../utils/database.js";

export default {
    data: {
        name: "slavic-response",
        description: "Toggle casual replies when users speak Slavic languages (Russian, Ukrainian, etc).",
        default_member_permissions: String(PermissionsBitField.Flags.ManageGuild),
        dm_permission: false,
        options: [
            {
                name: "status",
                description: "Show whether Slavic auto-replies are currently enabled for this server.",
                type: 1,
            },
            {
                name: "enable",
                description: "Enable automatic casual Slavic language responses.",
                type: 1,
            },
            {
                name: "disable",
                description: "Disable automatic casual Slavic language responses.",
                type: 1,
            },
        ],
    },

    async execute(interaction) {
        if (!interaction.guildId) {
            return safeRespond(interaction, asEmbedPayload({
                guildId: null,
                type: "error",
                title: "Server Only",
                description: "This command can only be used inside a server.",
                ephemeral: true,
            }));
        }

        const settings = getGuildSettings(interaction.guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === "status") {
            const on = !!settings.slavicResponseEnabled;
            return safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guildId,
                type: on ? "success" : "info",
                title: "Slavic Response",
                description: on
                    ? "✅ **Enabled** — the bot will auto-reply with casual, human-like messages when it detects Slavic languages (ru, uk, pl, etc)."
                    : "❌ **Disabled** — use `/slavic-response enable` to turn it on.",
                ephemeral: true,
            }));
        }

        const enabling = sub === "enable";
        settings.slavicResponseEnabled = enabling;
        await saveSettings();

        return safeRespond(interaction, asEmbedPayload({
            guildId: interaction.guildId,
            type: enabling ? "success" : "info",
            title: enabling ? "Slavic Response Enabled" : "Slavic Response Disabled",
            description: enabling
                ? "The bot will now detect Russian, Ukrainian, Polish, Czech and other Slavic messages and reply with natural, casual responses in the same language."
                : "Automatic Slavic replies are now off.",
            ephemeral: true,
        }));
    },
};
