import { PermissionsBitField } from "discord.js";
import { replyEmbed } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";
import { getGuildSettings } from "../../utils/database.js";
import { getMenuByMessage, getMenuOptions, buildMenuEmbed, refreshMenuMessage } from "../../utils/selfRoles.js";

export default {
    name: "selfroles",
    aliases: ["sr"],
    meta: {
        requiredUserPermissions: [PermissionsBitField.Flags.ManageRoles],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageRoles],
    },
    async execute(message, args) {
        const sub = (args[0] || "").toLowerCase();
        const db = await getDB();

        if (sub === "create") {
            const channel = message.mentions.channels.first();
            if (!channel?.isTextBased?.()) return replyEmbed(message, { type: "error", title: "Usage", description: "`,selfroles create #channel | Title | Description`" });

            const after = args.slice(1).filter((a) => !/^<#\d+>$/.test(a)).join(" ");
            const segments = after.split("|").map((s) => s.trim());
            const title = (segments[0] || "Self Roles").slice(0, 256);
            const description = segments[1] ? segments[1].slice(0, 2000) : null;

            const result = await db.run(
                "INSERT INTO self_role_menus (guild_id, channel_id, message_id, title, description, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                message.guild.id, channel.id, null, title, description, "multiple", Date.now()
            );
            const menu = await db.get("SELECT * FROM self_role_menus WHERE id = ?", result.lastID);
            const embed = await buildMenuEmbed(menu);
            const msg = await channel.send({ embeds: [embed], components: [] }).catch(() => null);
            if (!msg) return replyEmbed(message, { type: "error", title: "Failed", description: "I couldn't post in that channel." });
            await db.run("UPDATE self_role_menus SET message_id = ? WHERE id = ?", msg.id, menu.id);

            return replyEmbed(message, { type: "success", title: "Menu Created", description: `Created in ${channel}.\nAdd roles: \`,selfroles add ${msg.id} @Role | Label\`` });
        }

        if (sub === "add") {
            const messageId = args.find((a) => /^\d{16,21}$/.test(a));
            const role = message.mentions.roles.first();
            if (!messageId || !role) return replyEmbed(message, { type: "error", title: "Usage", description: "`,selfroles add <messageId> @role | Label | emoji`" });

            const menu = await getMenuByMessage(message.guild.id, messageId);
            if (!menu) return replyEmbed(message, { type: "error", title: "Menu Not Found", description: "No self-role menu with that message ID." });
            if (role.managed || role.id === message.guild.id) return replyEmbed(message, { type: "error", title: "Invalid Role", description: "That role can't be self-assigned." });

            const me = message.guild.members.me;
            if (me.roles.highest.position <= role.position) return replyEmbed(message, { type: "error", title: "Role Too High", description: `**${role.name}** is above my highest role.` });

            const options = await getMenuOptions(menu.id);
            const max = getGuildSettings(message.guild.id).selfRoles.maxPerMenu || 25;
            if (options.length >= max) return replyEmbed(message, { type: "error", title: "Menu Full", description: `A menu can hold at most **${max}** roles.` });
            if (options.some((o) => o.role_id === role.id)) return replyEmbed(message, { type: "error", title: "Already Added", description: "That role is already in this menu." });

            const after = args
                .filter((a) => a !== messageId && a.toLowerCase() !== "add" && !/^<@&\d+>$/.test(a))
                .join(" ");
            const segments = after.split("|").map((s) => s.trim());
            const label = (segments[0] || role.name).slice(0, 80);
            const emoji = segments[1] ? segments[1].slice(0, 64) : null;

            await db.run(
                "INSERT INTO self_role_options (menu_id, role_id, label, emoji, style, position) VALUES (?, ?, ?, ?, ?, ?)",
                menu.id, role.id, label, emoji, "Secondary", options.length
            );
            await refreshMenuMessage(message.client, menu);
            return replyEmbed(message, { type: "success", title: "Role Added", description: `Added ${role} to the menu.` });
        }

        if (sub === "remove") {
            const messageId = args.find((a) => /^\d{16,21}$/.test(a));
            const role = message.mentions.roles.first();
            if (!messageId || !role) return replyEmbed(message, { type: "error", title: "Usage", description: "`,selfroles remove <messageId> @role`" });
            const menu = await getMenuByMessage(message.guild.id, messageId);
            if (!menu) return replyEmbed(message, { type: "error", title: "Menu Not Found", description: "No self-role menu with that message ID." });

            const res = await db.run("DELETE FROM self_role_options WHERE menu_id = ? AND role_id = ?", menu.id, role.id);
            if (!res.changes) return replyEmbed(message, { type: "error", title: "Not in Menu", description: "That role isn't in this menu." });
            await refreshMenuMessage(message.client, menu);
            return replyEmbed(message, { type: "success", title: "Role Removed", description: `Removed ${role} from the menu.` });
        }

        if (sub === "list") {
            const menus = await db.all("SELECT * FROM self_role_menus WHERE guild_id = ? ORDER BY id ASC", message.guild.id);
            if (!menus.length) return replyEmbed(message, { type: "info", title: "No Menus", description: "Create one with `,selfroles create #channel | Title`." });
            const lines = [];
            for (const m of menus) {
                const opts = await getMenuOptions(m.id);
                lines.push(`**${m.title}** - <#${m.channel_id}> · \`${m.message_id}\` · ${opts.length} role(s)`);
            }
            return replyEmbed(message, { type: "info", title: "Self-Role Menus", description: lines.join("\n").slice(0, 4000) });
        }

        if (sub === "delete") {
            const messageId = args.find((a) => /^\d{16,21}$/.test(a));
            if (!messageId) return replyEmbed(message, { type: "error", title: "Usage", description: "`,selfroles delete <messageId>`" });
            const menu = await getMenuByMessage(message.guild.id, messageId);
            if (!menu) return replyEmbed(message, { type: "error", title: "Menu Not Found", description: "No self-role menu with that message ID." });

            await db.run("DELETE FROM self_role_options WHERE menu_id = ?", menu.id);
            await db.run("DELETE FROM self_role_menus WHERE id = ?", menu.id);
            const channel = await message.client.channels.fetch(menu.channel_id).catch(() => null);
            if (channel?.isTextBased()) {
                const msg = await channel.messages.fetch(menu.message_id).catch(() => null);
                if (msg) await msg.delete().catch(() => null);
            }
            return replyEmbed(message, { type: "success", title: "Menu Deleted", description: "The self-role menu was removed." });
        }

        return replyEmbed(message, { type: "error", title: "Usage", description: "`,selfroles create #channel | Title | Description`\n`,selfroles add <messageId> @role | Label | emoji`\n`,selfroles remove <messageId> @role`\n`,selfroles list`\n`,selfroles delete <messageId>`" });
    },
};
