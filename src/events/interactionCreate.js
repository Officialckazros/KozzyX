import { Events, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { safeRespond } from "../utils/helpers.js";
import { asEmbedPayload, buildCoolEmbed } from "../utils/embeds.js";
import { getDB } from "../utils/db.js";
import { runSlashGuards } from "../utils/commandGuards.js";
import { buildGeneratedHelpPages, helpRow } from "../slashCommands/general/help.js";
import { buildModHelpPages, modRow, configRow } from "../slashCommands/general/modhelp.js";
import { featureHelpPages } from "../slashCommands/general/features.js";

async function tryUpdate(interaction, payload) {
    try {
        return await interaction.update(payload);
    } catch (e) {
        if (e?.code === 10062 || e?.code === 40060) return;
        throw e;
    }
}

function clampPage(page, total) {
    if (!Number.isFinite(page)) return 0;
    return Math.max(0, Math.min(page, Math.max(0, total - 1)));
}

export default {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const cmdName = interaction.commandName;
            let command = client.slashCommands.get(cmdName);

            if (!command) {
                console.warn(`[Interaction] Command '${cmdName}' not found in cache, reloading handlers...`);
                const now = Date.now();
                if (!client._lastCmdReload || now - client._lastCmdReload > 30000) {
                    client._lastCmdReload = now;
                    try {
                        const { default: loadCommands } = await import("../handlers/commandHandler.js");
                        await loadCommands(client, { silent: true });
                        command = client.slashCommands.get(cmdName);
                    } catch (e) {
                        console.error(`[Interaction] Reload failed for '${cmdName}':`, e);
                    }
                }
            }

            if (!command) {
                console.error(`[Interaction] Command '${cmdName}' not found.`);
                return safeRespond(interaction, { content: `Command \`${cmdName}\` not found.`, ephemeral: true });
            }

            if (!await runSlashGuards(interaction, command)) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[Interaction] Execution failed for '${cmdName}':`, error);
                await safeRespond(interaction, { content: `Internal error while executing \`${cmdName}\`.`, ephemeral: true });
            }
            return;
        }

        if (interaction.isButton()) {
            const id = interaction.customId;

            if (id.startsWith("help_prev:") || id.startsWith("help_next:")) {
                const [action, category, pageStr] = id.split(":");
                let page = parseInt(pageStr);
                page = action === "help_next" ? page + 1 : page - 1;
                const safeCategory = category || "all";
                const pages = buildGeneratedHelpPages(interaction.client, safeCategory);
                const safePage = clampPage(page, pages.length);
                return tryUpdate(interaction, { embeds: [pages[safePage]], components: [helpRow(safeCategory, safePage, pages.length)] });
            }

            if (id.startsWith("modhelp_prev:") || id.startsWith("modhelp_next:")) {
                const [action, pageStr] = id.split(":");
                let page = parseInt(pageStr);
                page = action === "modhelp_next" ? page + 1 : page - 1;
                const pages = buildModHelpPages(interaction.client, "mod");
                const safePage = clampPage(page, pages.length);
                return tryUpdate(interaction, { embeds: [pages[safePage]], components: [modRow(safePage, pages.length)] });
            }

            if (id.startsWith("cfghelp_prev:") || id.startsWith("cfghelp_next:")) {
                const [action, pageStr] = id.split(":");
                let page = parseInt(pageStr);
                page = action === "cfghelp_next" ? page + 1 : page - 1;
                const pages = buildModHelpPages(interaction.client, "config");
                const safePage = clampPage(page, pages.length);
                return tryUpdate(interaction, { embeds: [pages[safePage]], components: [configRow(safePage, pages.length)] });
            }

            if (id.startsWith("modhelp_switch:")) {
                const [, mode, pageStr] = id.split(":");
                const page = parseInt(pageStr);
                if (mode === "config") {
                    const pages = buildModHelpPages(interaction.client, "config");
                    const safePage = clampPage(page, pages.length);
                    return tryUpdate(interaction, { embeds: [pages[safePage]], components: [configRow(safePage, pages.length)] });
                } else {
                    const pages = buildModHelpPages(interaction.client, "mod");
                    const safePage = clampPage(page, pages.length);
                    return tryUpdate(interaction, { embeds: [pages[safePage]], components: [modRow(safePage, pages.length)] });
                }
            }

            if (id.startsWith("features_prev:") || id.startsWith("features_next:")) {
                const [action, pageStr] = id.split(":");
                let page = parseInt(pageStr);
                page = action === "features_next" ? page + 1 : page - 1;
                page = clampPage(page, featureHelpPages.length);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`features_prev:${page}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId(`features_next:${page}`).setLabel("Next ").setStyle(ButtonStyle.Primary).setDisabled(page === featureHelpPages.length - 1)
                );
                return tryUpdate(interaction, { embeds: [featureHelpPages[page]], components: [row] });
            }

            if (id.startsWith("appeal_")) {
                return handleAppealButton(interaction);
            }
        }
    }
};

async function handleAppealButton(interaction) {
    if (!interaction.guild) return;
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return safeRespond(interaction, asEmbedPayload({ guildId: interaction.guildId, type: "error", title: "Restricted", description: "You need **Ban Members** to handle appeals.", ephemeral: true }));
    }

    const parts = interaction.customId.split("_");
    const action   = parts[1];
    const appealId = parts[2];
    const userId   = parts[3];

    const db = await getDB();
    const appeal = await db.get("SELECT * FROM appeals WHERE id = ?", appealId);
    if (!appeal || appeal.status !== "pending") {
        return safeRespond(interaction, asEmbedPayload({ guildId: interaction.guildId, type: "warning", title: "Already Resolved", description: "This appeal has already been handled.", ephemeral: true }));
    }

    if (action === "pending") {
        await db.run("UPDATE appeals SET status = 'reviewing', staff_id = ? WHERE id = ?", interaction.user.id, appealId);
        await interaction.update({ components: [] }).catch(() => null);
        return safeRespond(interaction, asEmbedPayload({ guildId: interaction.guildId, type: "info", title: "Marked as Reviewing", description: `Appeal #${appealId} is marked as under review by ${interaction.user.tag}.`, ephemeral: true }));
    }

    if (action === "accept") {
        await interaction.guild.bans.remove(userId, `Appeal #${appealId} accepted by ${interaction.user.tag}`).catch(() => null);
        await db.run("UPDATE appeals SET status = 'accepted', staff_id = ?, resolved_at = ? WHERE id = ?", interaction.user.id, Date.now(), appealId);

        try {
            const user = await interaction.client.users.fetch(userId);
            await user.send({ embeds: [buildCoolEmbed({ guildId: null, type: "success", title: "Appeal Accepted", description: `Your ban appeal for **${interaction.guild.name}** has been accepted. You are now unbanned.` })] }).catch(() => null);
        } catch { }

        await interaction.update({ components: [] }).catch(() => null);
        return safeRespond(interaction, asEmbedPayload({ guildId: interaction.guildId, type: "success", title: "Appeal Accepted", description: `<@${userId}> has been unbanned.`, ephemeral: true }));
    }

    if (action === "deny") {
        await db.run("UPDATE appeals SET status = 'denied', staff_id = ?, resolved_at = ? WHERE id = ?", interaction.user.id, Date.now(), appealId);

        try {
            const user = await interaction.client.users.fetch(userId);
            await user.send({ embeds: [buildCoolEmbed({ guildId: null, type: "error", title: "Appeal Denied", description: `Your ban appeal for **${interaction.guild.name}** has been denied.` })] }).catch(() => null);
        } catch { }

        await interaction.update({ components: [] }).catch(() => null);
        return safeRespond(interaction, asEmbedPayload({ guildId: interaction.guildId, type: "info", title: "Appeal Denied", description: `Appeal #${appealId} has been denied.`, ephemeral: true }));
    }
}
