import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildSettings } from "./database.js";
import { buildCoolEmbed } from "./embeds.js";
import { formatDuration } from "./moderationUtils.js";

const STYLE_MAP = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
};

export function buildVerifyPanel(guildId) {
    const v = getGuildSettings(guildId).verification;
    const embed = buildCoolEmbed({
        guildId,
        type: "info",
        title: v.title || "Verification Required",
        description: v.description || "Click the button below to verify yourself and gain access.",
        footerText: "Verification",
    });

    const button = new ButtonBuilder()
        .setCustomId("verify:gate")
        .setLabel((v.buttonLabel || "Verify").slice(0, 80))
        .setStyle(STYLE_MAP[v.buttonStyle] || ButtonStyle.Success);
    if (v.buttonEmoji) {
        try { button.setEmoji(v.buttonEmoji); } catch {  }
    }

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

export async function handleVerify(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    const v = settings.verification;

    if (!v.enabled || !v.roleId) {
        return { ok: false, reason: "Verification isn't configured on this server." };
    }

    const role = interaction.guild.roles.cache.get(v.roleId);
    if (!role) return { ok: false, reason: "The verification role no longer exists. Ask an admin to reconfigure it." };

    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
        return { ok: false, reason: "You're already verified.", already: true };
    }

    if (v.minAccountAgeMs > 0) {
        const age = Date.now() - interaction.user.createdTimestamp;
        if (age < v.minAccountAgeMs) {
            return { ok: false, reason: `Your account is too new to verify. Accounts must be at least **${formatDuration(v.minAccountAgeMs)}** old.` };
        }
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions?.has("ManageRoles")) return { ok: false, reason: "I'm missing the **Manage Roles** permission." };
    if (me.roles.highest.position <= role.position) return { ok: false, reason: "The verification role is above my highest role, so I can't assign it." };

    try {
        await member.roles.add(role.id, "Member verified");
        return { ok: true, message: v.successMessage || "You're verified! Welcome aboard." };
    } catch (err) {
        console.error("[verification] add role error:", err);
        return { ok: false, reason: "Failed to assign the role. I may be missing permissions." };
    }
}
