import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getDB } from "./db.js";
import { buildCoolEmbed } from "./embeds.js";

const STYLE_MAP = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
};

export async function getMenuByMessage(guildId, messageId) {
    const db = await getDB();
    return db.get("SELECT * FROM self_role_menus WHERE guild_id = ? AND message_id = ?", guildId, messageId);
}

export async function getMenuById(menuId) {
    const db = await getDB();
    return db.get("SELECT * FROM self_role_menus WHERE id = ?", menuId);
}

export async function getMenuOptions(menuId) {
    const db = await getDB();
    return db.all("SELECT * FROM self_role_options WHERE menu_id = ? ORDER BY position ASC, id ASC", menuId);
}

function applyEmoji(button, emoji) {
    if (!emoji) return;
    try { button.setEmoji(emoji); } catch {  }
}

export async function buildMenuComponents(menu) {
    const options = await getMenuOptions(menu.id);
    const rows = [];
    let current = null;
    for (let idx = 0; idx < options.length && rows.length < 5; idx++) {
        if (idx % 5 === 0) {
            current = new ActionRowBuilder();
            rows.push(current);
        }
        const opt = options[idx];
        const button = new ButtonBuilder()
            .setCustomId(`sr:${menu.id}:${opt.role_id}`)
            .setLabel(opt.label.slice(0, 80))
            .setStyle(STYLE_MAP[opt.style] || ButtonStyle.Secondary);
        applyEmoji(button, opt.emoji);
        current.addComponents(button);
    }
    return rows;
}

export async function buildMenuEmbed(menu) {
    const options = await getMenuOptions(menu.id);
    const lines = [];
    if (menu.description) lines.push(menu.description);
    if (options.length) {
        lines.push("");
        for (const opt of options) {
            lines.push(`${opt.emoji ? `${opt.emoji} ` : ""}**${opt.label}** — <@&${opt.role_id}>`);
        }
    } else {
        lines.push("");
        lines.push("*No roles added yet. Use `/selfroles add` to add some.*");
    }
    lines.push("");
    lines.push(menu.mode === "single"
        ? "_You can pick only one role from this menu._"
        : "_Click a button to toggle that role._");

    return buildCoolEmbed({
        guildId: menu.guild_id,
        type: "settings",
        title: menu.title || "Self Roles",
        description: lines.join("\n"),
        footerText: "Self-assignable roles",
    });
}

export async function refreshMenuMessage(client, menu) {
    if (!menu.message_id) return false;
    const channel = await client.channels.fetch(menu.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return false;
    const msg = await channel.messages.fetch(menu.message_id).catch(() => null);
    if (!msg) return false;

    const embed = await buildMenuEmbed(menu);
    const components = await buildMenuComponents(menu);
    await msg.edit({ embeds: [embed], components }).catch(() => null);
    return true;
}

export async function toggleRole(interaction, menuId, roleId) {
    const menu = await getMenuById(menuId);
    if (!menu) return { ok: false, reason: "This self-role menu no longer exists." };

    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return { ok: false, reason: "That role no longer exists." };

    const me = interaction.guild.members.me;
    if (!me?.permissions?.has("ManageRoles")) return { ok: false, reason: "I'm missing the **Manage Roles** permission." };
    if (me.roles.highest.position <= role.position) return { ok: false, reason: `I can't assign **${role.name}** — it's above my highest role.` };

    const member = interaction.member;
    const has = member.roles.cache.has(roleId);

    try {
        if (has) {
            await member.roles.remove(roleId, "Self-role removed");
            return { ok: true, added: false, role };
        }

        if (menu.mode === "single") {
            const options = await getMenuOptions(menuId);
            const otherIds = options.map((o) => o.role_id).filter((id) => id !== roleId && member.roles.cache.has(id));
            if (otherIds.length) await member.roles.remove(otherIds, "Self-role (single mode) swap").catch(() => null);
        }

        await member.roles.add(roleId, "Self-role added");
        return { ok: true, added: true, role };
    } catch (err) {
        console.error("[selfRoles] toggle error:", err);
        return { ok: false, reason: "Failed to update your roles. I may be missing permissions." };
    }
}
