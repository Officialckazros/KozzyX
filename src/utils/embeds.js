import { EmbedBuilder } from "discord.js";
import { getGuildSettings } from "./database.js";

export function buildCoolEmbed({ guildId, type = "info", client, title = null, description = null, footerUser = null, fields = null, showAuthor = false, showFooter = false, footerText = null, thumbnail = null }) {
    const settings = guildId ? getGuildSettings(guildId) : null;
    const color = settings?.embedColors?.[type] ?? 0x5865f2;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTimestamp();

    if (showAuthor && client?.user) {
        embed.setAuthor({
            name: client.user.username,
            iconURL: client.user.displayAvatarURL(),
        });
    }

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (Array.isArray(fields) && fields.length) embed.addFields(fields);
    if (thumbnail) embed.setThumbnail(thumbnail);

    // Every embed gets a consistent, branded footer so nothing ever looks unfinished.
    const brandIcon = client?.user ? client.user.displayAvatarURL() : undefined;
    if (footerUser) {
        embed.setFooter({
            text: `Requested by ${footerUser.tag}`,
            iconURL: footerUser.displayAvatarURL({ dynamic: true }),
        });
    } else if (footerText) {
        embed.setFooter({ text: footerText, iconURL: brandIcon });
    } else if (client?.user) {
        embed.setFooter({ text: client.user.username, iconURL: brandIcon });
    }

    return embed;
}

export function asEmbedPayload({ guildId, type, client, title, description, footerUser, fields, ephemeral = false, components = undefined, allowedMentions = undefined, thumbnail = undefined }) {
    return {
        embeds: [buildCoolEmbed({ guildId, type, client, title, description, footerUser, fields, thumbnail, showAuthor: true })],
        ephemeral,
        components,
        allowedMentions,
    };
}

export async function replyEmbed(message, opts) {
    return message.reply(asEmbedPayload({ guildId: message.guild?.id, footerUser: message.author, client: message.client, ...opts }));
}

export async function sendEmbed(channel, guildId, opts) {
    return channel.send(asEmbedPayload({ guildId, client: channel.client, ...opts }));
}

export function caseEmbed(guildId, title, lines = []) {
    return buildCoolEmbed({
        guildId,
        type: "case",
        title,
        description: lines.filter(Boolean).join("\n"),
        footerUser: null,
    });
}

export async function postCase(guild, embed, originChannelId = null) {
    try {
        if (!guild) return;
        const settings = getGuildSettings(guild.id);
        if (!settings.caseChannelId) return;

        if (originChannelId && settings.caseChannelId === originChannelId) return;

        const ch = guild.channels.cache.get(settings.caseChannelId);
        if (!ch || !ch.isTextBased()) return;

        await ch.send({ embeds: [embed] });
    } catch (err) {
        console.error("Case post error:", err);
    }
}
