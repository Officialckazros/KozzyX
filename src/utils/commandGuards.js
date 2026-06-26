import { PermissionsBitField } from "discord.js";
import { isCommandEnabled, checkCooldown } from "../dashboard-api.js";
import { asEmbedPayload, replyEmbed } from "./embeds.js";
import { safeRespond } from "./helpers.js";
import { commandMention, formatPermissionNames } from "./commandMeta.js";

const localCooldowns = new Map();

function permissionsOf(value) {
    if (!value) return new PermissionsBitField();
    if (value instanceof PermissionsBitField) return value;
    if (value.permissions) return new PermissionsBitField(value.permissions);
    return new PermissionsBitField(value);
}

function missingPermissions(available, required = []) {
    if (!required.length) return [];
    const bitfield = permissionsOf(available);
    return required.filter((permission) => !bitfield.has(permission));
}

function checkLocalCooldown(meta, userId) {
    const seconds = Number(meta.cooldownSeconds || 0);
    if (!seconds || seconds <= 0) return { ok: true };

    const key = `${meta.kind}:${meta.name}:${userId}`;
    const last = localCooldowns.get(key) || 0;
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < seconds) return { ok: false, remaining: Math.ceil(seconds - elapsed) };
    localCooldowns.set(key, Date.now());
    return { ok: true };
}

export async function runSlashGuards(interaction, command) {
    const meta = command.meta || { kind: "slash", name: interaction.commandName, cooldownSeconds: 0 };
    const label = commandMention(meta);

    if (meta.guildOnly && !interaction.guildId) {
        await safeRespond(interaction, asEmbedPayload({
            guildId: null,
            type: "error",
            title: "Server only",
            description: `\`${label}\` can only be used in a server.`,
            ephemeral: true,
        }));
        return false;
    }

    if (!isCommandEnabled("slash", meta.name)) {
        await safeRespond(interaction, { content: `The \`${label}\` command is currently disabled.`, ephemeral: true });
        return false;
    }

    const missingUser = missingPermissions(interaction.memberPermissions || interaction.member, meta.requiredUserPermissions);
    if (missingUser.length) {
        await safeRespond(interaction, asEmbedPayload({
            guildId: interaction.guildId,
            type: "error",
            title: "Permission Needed",
            description: `You need **${formatPermissionNames(missingUser)}** to use \`${label}\`.`,
            ephemeral: true,
        }));
        return false;
    }

    if (interaction.guild) {
        const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
        const missingBot = missingPermissions(me, meta.requiredBotPermissions);
        if (missingBot.length) {
            await safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guildId,
                type: "error",
                title: "Bot Missing Permission",
                description: `I need **${formatPermissionNames(missingBot)}** to run \`${label}\`.`,
                ephemeral: true,
            }));
            return false;
        }
    }

    const dashboardCooldown = checkCooldown("slash", meta.name, interaction.user.id);
    const cooldown = dashboardCooldown.ok ? checkLocalCooldown(meta, interaction.user.id) : dashboardCooldown;
    if (!cooldown.ok) {
        await safeRespond(interaction, { content: `Please wait **${cooldown.remaining}s** before using \`${label}\` again.`, ephemeral: true });
        return false;
    }

    return true;
}

export async function runPrefixGuards(message, command) {
    const meta = command.meta || { kind: "prefix", name: command.name, usage: command.name, cooldownSeconds: 0 };
    const label = commandMention(meta);

    if (!message.guild) return false;

    if (!isCommandEnabled("prefix", meta.name)) {
        await replyEmbed(message, {
            type: "error",
            title: "Command Disabled",
            description: `The \`${label}\` command is currently disabled from the dashboard.`,
        });
        return false;
    }

    const missingUser = missingPermissions(message.member, meta.requiredUserPermissions);
    if (missingUser.length) {
        await replyEmbed(message, {
            type: "error",
            title: "Permission Needed",
            description: `You need **${formatPermissionNames(missingUser)}** to use \`${label}\`.`,
        });
        return false;
    }

    const me = message.guild.members.me;
    const missingBot = missingPermissions(me, meta.requiredBotPermissions);
    if (missingBot.length) {
        await replyEmbed(message, {
            type: "error",
            title: "Bot Missing Permission",
            description: `I need **${formatPermissionNames(missingBot)}** to run \`${label}\`.`,
        });
        return false;
    }

    const dashboardCooldown = checkCooldown("prefix", meta.name, message.author.id);
    const cooldown = dashboardCooldown.ok ? checkLocalCooldown(meta, message.author.id) : dashboardCooldown;
    if (!cooldown.ok) {
        await replyEmbed(message, {
            type: "warning",
            title: "Slow Down",
            description: `Wait **${cooldown.remaining}s** before using \`${label}\` again.`,
        });
        return false;
    }

    return true;
}
