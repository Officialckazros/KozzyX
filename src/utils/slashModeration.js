import {
    validateModAction,
    createCase,
    trySendModDM,
    buildModEmbed,
    formatDuration,
} from "./moderationUtils.js";
import { getGuildSettings, getWarningData, saveWarnings } from "./database.js";
import { safeRespond } from "./helpers.js";
import { asEmbedPayload, buildCoolEmbed, sendEmbed, postCase } from "./embeds.js";
import { addTempBan } from "./tempbans.js";

function modErr(interaction, title, description) {
    return safeRespond(interaction, asEmbedPayload({
        guildId: interaction.guildId, type: "error", title, description, ephemeral: true,
    }));
}

async function postModLog(guild, embed, originChannelId) {
    await postCase(guild, embed, originChannelId);
    try {
        const s = getGuildSettings(guild.id);
        const logId = s.moderation?.logChannelId;
        if (!logId || logId === s.caseChannelId) return;
        if (originChannelId && logId === originChannelId) return;
        const ch = guild.channels.cache.get(logId);
        if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
    } catch {  }
}

export async function slashKick(interaction, member, reason) {
    const v = validateModAction({ executor: interaction.member, target: member, action: "kick" });
    if (!v.ok) return modErr(interaction, "Cannot Kick", v.reason);

    const settings = getGuildSettings(interaction.guildId);
    try {
        const caseNumber = await createCase({ guild: interaction.guild, action: "kick", target: member.user, executor: interaction.user, reason });
        if (settings.moderation.dmOnAction) {
            await trySendModDM({ user: member.user, guild: interaction.guild, type: "mod", title: "You were kicked", description: "You were kicked from the server.", moderatorTag: interaction.user.tag, reason, caseNumber });
        }
        await member.kick(reason);

        const embed = buildModEmbed({ guild: interaction.guild, type: "mod", title: "Member Kicked", target: member, executor: interaction.user, reason, caseNumber });
        await safeRespond(interaction, { embeds: [embed] });
        await postModLog(interaction.guild, embed, interaction.channelId);
    } catch (err) {
        console.error("[slashKick] error:", err);
        return modErr(interaction, "Kick Failed", "Failed to kick that user.");
    }
}

export async function slashBan(interaction, user, reason, { deleteDays = 0, durationMs = null } = {}) {
    const v = validateModAction({ executor: interaction.member, target: user, action: "ban", requireMember: false });
    if (!v.ok) return modErr(interaction, "Cannot Ban", v.reason);

    const settings = getGuildSettings(interaction.guildId);
    const action = durationMs ? "tempban" : "ban";
    const durationText = durationMs ? formatDuration(durationMs) : null;

    try {
        const existing = await interaction.guild.bans.fetch(user.id).catch(() => null);
        if (existing) return modErr(interaction, "Already Banned", "That user is already banned.");

        const caseNumber = await createCase({ guild: interaction.guild, action, target: user, executor: interaction.user, reason, durationMs });
        const appealNote = `\n\nTo appeal, use \`/appeal\` in any server with this bot and provide server ID \`${interaction.guild.id}\`.`;

        if (settings.moderation.dmOnAction) {
            await trySendModDM({
                user, guild: interaction.guild, type: "mod",
                title: durationMs ? "You were temporarily banned" : "You were banned",
                description: `You have been ${durationMs ? "temporarily " : ""}banned from the server.${appealNote}`,
                moderatorTag: interaction.user.tag, reason, durationText, caseNumber,
            });
        }

        await interaction.guild.members.ban(user.id, {
            deleteMessageSeconds: Math.max(0, Math.min(7, deleteDays)) * 24 * 60 * 60,
            reason: `${interaction.user.tag}: ${reason}`,
        });

        if (durationMs) {
            await addTempBan({ guildId: interaction.guild.id, userId: user.id, unbanAt: Date.now() + durationMs, reason, executorId: interaction.user.id });
        }

        const embed = buildModEmbed({
            guild: interaction.guild, type: "mod",
            title: durationMs ? "Member Temporarily Banned" : "Member Banned",
            target: user, executor: interaction.user, reason, caseNumber, durationText,
        });
        await safeRespond(interaction, { embeds: [embed] });
        await postModLog(interaction.guild, embed, interaction.channelId);
    } catch (err) {
        console.error("[slashBan] error:", err);
        return modErr(interaction, "Ban Failed", "Failed to ban that user.");
    }
}

export async function slashSoftban(interaction, user, reason) {
    const v = validateModAction({ executor: interaction.member, target: user, action: "softban", requireMember: false });
    if (!v.ok) return modErr(interaction, "Cannot Softban", v.reason);

    const settings = getGuildSettings(interaction.guildId);
    try {
        const caseNumber = await createCase({ guild: interaction.guild, action: "softban", target: user, executor: interaction.user, reason });
        if (settings.moderation.dmOnAction) {
            await trySendModDM({ user, guild: interaction.guild, type: "mod", title: "You were softbanned", description: "You were temporarily banned to purge your recent messages. You can rejoin with a new invite.", moderatorTag: interaction.user.tag, reason, caseNumber });
        }
        await interaction.guild.members.ban(user.id, { deleteMessageSeconds: 7 * 24 * 60 * 60, reason: `${interaction.user.tag}: ${reason}` });
        await interaction.guild.members.unban(user.id, "Softban - auto unban");

        const embed = buildModEmbed({
            guild: interaction.guild, type: "mod", title: "Member Softbanned",
            target: user, executor: interaction.user, reason, caseNumber,
            extra: [{ name: "Notice", value: "Messages from the last 7 days were purged. User may rejoin.", inline: false }],
        });
        await safeRespond(interaction, { embeds: [embed] });
        await postModLog(interaction.guild, embed, interaction.channelId);
    } catch (err) {
        console.error("[slashSoftban] error:", err);
        return modErr(interaction, "Softban Failed", "Failed to softban that user.");
    }
}

export async function slashTimeout(interaction, member, ms, reason) {
    const v = validateModAction({ executor: interaction.member, target: member, action: "timeout" });
    if (!v.ok) return modErr(interaction, "Cannot Timeout", v.reason);

    const settings = getGuildSettings(interaction.guildId);
    const durationText = formatDuration(ms);
    try {
        const caseNumber = await createCase({ guild: interaction.guild, action: "timeout", target: member.user, executor: interaction.user, reason, durationMs: ms });
        if (settings.moderation.dmOnAction) {
            await trySendModDM({ user: member.user, guild: interaction.guild, type: "mod", title: "You were timed out", description: "You were timed out in the server.", moderatorTag: interaction.user.tag, reason, durationText, caseNumber });
        }
        await member.timeout(ms, `${interaction.user.tag}: ${reason || "Timeout"}`);

        const embed = buildModEmbed({ guild: interaction.guild, type: "mod", title: "Member Timed Out", target: member, executor: interaction.user, reason, caseNumber, durationText });
        await safeRespond(interaction, { embeds: [embed] });
        await postModLog(interaction.guild, embed, interaction.channelId);
    } catch (err) {
        console.error("[slashTimeout] error:", err);
        return modErr(interaction, "Timeout Failed", "Failed to timeout that user.");
    }
}

export async function slashUntimeout(interaction, member) {
    const v = validateModAction({ executor: interaction.member, target: member, action: "untimeout" });
    if (!v.ok) return modErr(interaction, "Cannot Untimeout", v.reason);

    if (!member.isCommunicationDisabled()) {
        return modErr(interaction, "Not Timed Out", "That member is not currently timed out.");
    }

    const settings = getGuildSettings(interaction.guildId);
    try {
        const caseNumber = await createCase({ guild: interaction.guild, action: "untimeout", target: member.user, executor: interaction.user });
        if (settings.moderation.dmOnAction) {
            await trySendModDM({ user: member.user, guild: interaction.guild, type: "success", title: "Timeout removed", description: "Your timeout has been removed.", moderatorTag: interaction.user.tag, caseNumber });
        }
        await member.timeout(null, `${interaction.user.tag}: Timeout removed`);

        const embed = buildModEmbed({ guild: interaction.guild, type: "success", title: "Timeout Removed", target: member, executor: interaction.user, caseNumber });
        await safeRespond(interaction, { embeds: [embed] });
        await postModLog(interaction.guild, embed, interaction.channelId);
    } catch (err) {
        console.error("[slashUntimeout] error:", err);
        return modErr(interaction, "Failed", "Failed to remove timeout.");
    }
}

async function checkWarnThresholds(interaction, member, warnCount) {
    const settings = getGuildSettings(member.guild.id);
    if (!Array.isArray(settings.warnThresholds)) return;
    for (const t of settings.warnThresholds) {
        if (warnCount !== t.count) continue;
        const reason = `Warn threshold reached (${warnCount} warns)`;
        try {
            if (t.action === "timeout") {
                await member.timeout((t.time || 0) * 60000, reason);
                await createCase({ guild: member.guild, action: "auto_timeout", target: member.user, executor: interaction.user, reason, durationMs: (t.time || 0) * 60000 });
                await sendEmbed(interaction.channel, member.guild.id, { type: "warning", title: "Warn Threshold Triggered", description: `${member} has been **timed out** for **${formatDuration((t.time || 0) * 60000)}** (auto).` });
            } else if (t.action === "kick") {
                await member.kick(reason);
                await createCase({ guild: member.guild, action: "auto_kick", target: member.user, executor: interaction.user, reason });
                await sendEmbed(interaction.channel, member.guild.id, { type: "warning", title: "Warn Threshold Triggered", description: `${member.user.tag} has been **kicked** (auto).` });
            } else if (t.action === "ban") {
                await member.ban({ reason });
                await createCase({ guild: member.guild, action: "auto_ban", target: member.user, executor: interaction.user, reason });
                await sendEmbed(interaction.channel, member.guild.id, { type: "warning", title: "Warn Threshold Triggered", description: `${member.user.tag} has been **banned** (auto).` });
            }
        } catch {  }
    }
}

export async function slashWarn(interaction, member, reason) {
    const v = validateModAction({ executor: interaction.member, target: member, action: "warn" });
    if (!v.ok) return modErr(interaction, "Cannot Warn", v.reason);

    const settings = getGuildSettings(interaction.guildId);
    const data = getWarningData(interaction.guild.id, member.id);
    data.count++;
    data.history.push({ action: "add", by: interaction.user.id, reason, at: Date.now() });
    await saveWarnings();

    const caseNumber = await createCase({ guild: interaction.guild, action: "warn", target: member.user, executor: interaction.user, reason });

    if (settings.moderation.dmOnAction) {
        await trySendModDM({ user: member.user, guild: interaction.guild, type: "warning", title: "You received a warning", description: "A moderator has issued you a warning.", moderatorTag: interaction.user.tag, reason: `${reason}\n**Total warnings:** ${data.count}`, caseNumber });
    }

    const embed = buildCoolEmbed({
        guildId: interaction.guild.id, type: "warning", title: "Warning Issued",
        fields: [
            { name: "Target", value: `${member}\n\`${member.id}\``, inline: true },
            { name: "Moderator", value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
            { name: "Case", value: `#${caseNumber}`, inline: true },
            { name: "Total Warnings", value: `**${data.count}**`, inline: true },
            { name: "Reason", value: reason, inline: false },
        ],
        showFooter: true, footerText: `Case #${caseNumber} • ${interaction.guild.name}`,
    }).setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }));

    await safeRespond(interaction, { embeds: [embed] });
    await postModLog(interaction.guild, embed, interaction.channelId);
    await checkWarnThresholds(interaction, member, data.count);
}

export async function slashWarnRemove(interaction, member, count) {
    const v = validateModAction({ executor: interaction.member, target: member, action: "modify warnings of" });
    if (!v.ok) return modErr(interaction, "Cannot Modify", v.reason);

    const data = getWarningData(interaction.guild.id, member.id);
    const before = data.count;
    data.count = Math.max(0, data.count - count);
    data.history.push({ action: "remove", by: interaction.user.id, count, at: Date.now() });
    await saveWarnings();

    const caseNumber = await createCase({ guild: interaction.guild, action: "warn_remove", target: member.user, executor: interaction.user, reason: `Removed ${count} warning(s)` });

    const settings = getGuildSettings(interaction.guildId);
    if (settings.moderation.dmOnAction) {
        await trySendModDM({ user: member.user, guild: interaction.guild, type: "success", title: "Warnings reduced", description: "A moderator reduced your warning count.", moderatorTag: interaction.user.tag, reason: `Removed ${count} warning(s). Total: ${before} → ${data.count}.`, caseNumber });
    }

    return safeRespond(interaction, asEmbedPayload({
        guildId: interaction.guildId, type: "success", title: "Warnings Reduced",
        description: `Removed **${count}** warning(s) from ${member}.\n**Total:** ${before} → **${data.count}**\n**Case:** \`#${caseNumber}\``,
    }));
}
