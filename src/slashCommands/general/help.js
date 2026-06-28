import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { commandMention, formatPermissionNames } from "../../utils/commandMeta.js";

export const helpCategories = [
    { name: "All", value: "all" },
    { name: "General", value: "general" },
    { name: "Fun", value: "fun" },
    { name: "Moderation", value: "moderation" },
    { name: "Configuration", value: "config" },
    { name: "Features", value: "features" },
];

function sortedCommands(client) {
    return [
        ...client.slashCommands.values(),
        ...client.prefixCommands.values(),
    ].filter((command) => command.meta)
        .sort((a, b) => {
            const ac = a.meta.categoryLabel.localeCompare(b.meta.categoryLabel);
            if (ac !== 0) return ac;
            return a.meta.name.localeCompare(b.meta.name);
        });
}

function commandField(command) {
    const meta = command.meta;
    const lines = [
        meta.description,
        `Usage: \`${commandMention(meta)}\``,
    ];
    if (meta.aliases?.length) lines.push(`Aliases: ${meta.aliases.map((a) => `\`${a}\``).join(", ")}`);
    if (meta.requiredUserPermissions?.length) lines.push(`Requires: **${formatPermissionNames(meta.requiredUserPermissions)}**`);
    if (meta.examples?.length) lines.push(`Example: \`${meta.examples[0]}\``);

    return {
        name: `${meta.kind === "slash" ? "/" : meta.config ? "!" : ","}${meta.name} · ${meta.categoryLabel}`,
        value: lines.join("\n").slice(0, 1024),
        inline: false,
    };
}

function clampPage(page, total) {
    if (!Number.isFinite(page)) return 0;
    return Math.max(0, Math.min(page, Math.max(0, total - 1)));
}

export function buildGeneratedHelpPages(client, category = "all") {
    const commands = sortedCommands(client).filter((command) => {
        if (category === "all") return true;
        return command.meta.category === category;
    });

    const title = category === "all"
        ? "Command Help"
        : `${helpCategories.find((c) => c.value === category)?.name || "Command"} Help`;
    const description = "Commands are generated from the live command registry.";

    const MAX_FIELDS = 6;
    const CHAR_BUDGET = 5500;
    const baseChars = title.length + description.length + 8;
    const groups = [];
    let current = [];
    let chars = baseChars;
    for (const command of commands) {
        const field = commandField(command);
        const fieldChars = field.name.length + field.value.length;
        if (current.length && (current.length >= MAX_FIELDS || chars + fieldChars > CHAR_BUDGET)) {
            groups.push(current);
            current = [];
            chars = baseChars;
        }
        current.push(field);
        chars += fieldChars;
    }
    if (current.length) groups.push(current);

    const total = groups.length || 1;
    const pages = groups.map((fields, index) =>
        new EmbedBuilder()
            .setTitle(`${title} (${index + 1}/${total})`)
            .setDescription(description)
            .setColor(0x5865f2)
            .addFields(fields)
    );

    if (!pages.length) {
        pages.push(
            new EmbedBuilder()
                .setTitle(`${title} (1/1)`)
                .setDescription("No commands are currently loaded for this category.")
                .setColor(0x5865f2)
        );
    }

    return pages;
}

export function helpRow(category, page, total) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_prev:${category}:${page}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`help_next:${category}:${page}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= total - 1),
    );
}

export async function sendPagedHelp(interaction, category = "all", page = 0) {
    const pages = buildGeneratedHelpPages(interaction.client, category);
    const safePage = clampPage(page, pages.length);
    return safeRespond(interaction, {
        embeds: [pages[safePage]],
        components: [helpRow(category, safePage, pages.length)],
        ephemeral: true,
    });
}

export default {
    data: {
        name: "help",
        description: "Show generated command help",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: "category",
                description: "Command category to show.",
                type: 3,
                required: false,
                choices: helpCategories,
            },
        ],
    },
    async execute(interaction) {
        return sendPagedHelp(interaction, interaction.options.getString("category") || "all", 0);
    },
};
