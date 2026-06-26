import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { buildGeneratedHelpPages } from "./help.js";

function clampPage(page, total) {
    if (!Number.isFinite(page)) return 0;
    return Math.max(0, Math.min(page, Math.max(0, total - 1)));
}

export function buildModHelpPages(client, mode = "mod") {
    return buildGeneratedHelpPages(client, mode === "config" ? "config" : "moderation");
}

export function modRow(page, total) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`modhelp_prev:${page}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`modhelp_next:${page}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= total - 1),
        new ButtonBuilder()
            .setCustomId("modhelp_switch:config:0")
            .setLabel("Config")
            .setStyle(ButtonStyle.Success),
    );
}

export function configRow(page, total) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cfghelp_prev:${page}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`cfghelp_next:${page}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= total - 1),
        new ButtonBuilder()
            .setCustomId("modhelp_switch:mod:0")
            .setLabel("Mod Help")
            .setStyle(ButtonStyle.Danger),
    );
}

export async function sendModHelpPage(interaction, mode = "mod", page = 0) {
    const pages = buildModHelpPages(interaction.client, mode);
    const safePage = clampPage(page, pages.length);
    return safeRespond(interaction, {
        embeds: [pages[safePage]],
        components: [mode === "config" ? configRow(safePage, pages.length) : modRow(safePage, pages.length)],
        ephemeral: true,
    });
}

export default {
    data: {
        name: "modhelp",
        description: "Show generated moderation and configuration help",
        options: [
            {
                name: "section",
                description: "Which command section to show.",
                type: 3,
                required: false,
                choices: [
                    { name: "Moderation", value: "mod" },
                    { name: "Configuration", value: "config" },
                ],
            },
        ],
    },
    async execute(interaction) {
        return sendModHelpPage(interaction, interaction.options.getString("section") || "mod", 0);
    },
};
