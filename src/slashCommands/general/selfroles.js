import { PermissionsBitField } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";
import { getGuildSettings } from "../../utils/database.js";
import { getMenuByMessage, getMenuOptions, buildMenuEmbed, refreshMenuMessage } from "../../utils/selfRoles.js";

const STYLE_CHOICES = [
    { name: "Blurple", value: "Primary" },
    { name: "Grey", value: "Secondary" },
    { name: "Green", value: "Success" },
    { name: "Red", value: "Danger" },
];

function err(i, title, description) {
    return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title, description, ephemeral: true }));
}

export default {
    meta: {
        category: "general",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageRoles],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageRoles],
    },
    data: {
        name: "selfroles",
        description: "Create and manage self-assignable button role menus",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageRoles.toString(),
        options: [
            {
                name: "create", description: "Create a new self-role menu", type: 1,
                options: [
                    { name: "channel", description: "Channel to post the menu in", type: 7, required: true, channel_types: [0, 5] },
                    { name: "title", description: "Menu title", type: 3, required: false },
                    { name: "description", description: "Menu description", type: 3, required: false },
                    { name: "mode", description: "Allow multiple roles or just one", type: 3, required: false, choices: [
                        { name: "Multiple (toggle each)", value: "multiple" },
                        { name: "Single (one at a time)", value: "single" },
                    ] },
                ],
            },
            {
                name: "add", description: "Add a role button to a menu", type: 1,
                options: [
                    { name: "message_id", description: "ID of the menu message", type: 3, required: true },
                    { name: "role", description: "Role to assign", type: 8, required: true },
                    { name: "label", description: "Button label (defaults to role name)", type: 3, required: false },
                    { name: "emoji", description: "Button emoji", type: 3, required: false },
                    { name: "style", description: "Button color", type: 3, required: false, choices: STYLE_CHOICES },
                ],
            },
            {
                name: "remove", description: "Remove a role button from a menu", type: 1,
                options: [
                    { name: "message_id", description: "ID of the menu message", type: 3, required: true },
                    { name: "role", description: "Role to remove from the menu", type: 8, required: true },
                ],
            },
            { name: "list", description: "List all self-role menus in this server", type: 1 },
            {
                name: "delete", description: "Delete a self-role menu", type: 1,
                options: [{ name: "message_id", description: "ID of the menu message", type: 3, required: true }],
            },
        ],
    },
    async execute(i) {
        const sub = i.options.getSubcommand();
        const db = await getDB();

        if (sub === "create") {
            const channel = i.options.getChannel("channel");
            if (!channel?.isTextBased?.()) return err(i, "Invalid Channel", "Pick a text channel.");
            const title = (i.options.getString("title") || "Self Roles").slice(0, 256);
            const description = i.options.getString("description")?.slice(0, 2000) || null;
            const mode = i.options.getString("mode") || "multiple";

            const result = await db.run(
                "INSERT INTO self_role_menus (guild_id, channel_id, message_id, title, description, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                i.guildId, channel.id, null, title, description, mode, Date.now()
            );
            const menu = await db.get("SELECT * FROM self_role_menus WHERE id = ?", result.lastID);
            const embed = await buildMenuEmbed(menu);
            const msg = await channel.send({ embeds: [embed], components: [] }).catch(() => null);
            if (!msg) return err(i, "Failed", "I couldn't post in that channel. Check my permissions.");
            await db.run("UPDATE self_role_menus SET message_id = ? WHERE id = ?", msg.id, menu.id);

            return safeRespond(i, asEmbedPayload({
                guildId: i.guildId, type: "success", title: "Menu Created",
                description: `Created self-role menu in ${channel}.\nAdd roles with:\n\`/selfroles add message_id:${msg.id} role:@Role\``,
                ephemeral: true,
            }));
        }

        if (sub === "add") {
            const messageId = i.options.getString("message_id");
            const role = i.options.getRole("role");
            const menu = await getMenuByMessage(i.guildId, messageId);
            if (!menu) return err(i, "Menu Not Found", "No self-role menu with that message ID in this server.");

            if (role.managed || role.id === i.guild.id) return err(i, "Invalid Role", "That role can't be self-assigned.");
            const me = i.guild.members.me;
            if (me.roles.highest.position <= role.position) return err(i, "Role Too High", `**${role.name}** is above my highest role, so I can't assign it.`);

            const options = await getMenuOptions(menu.id);
            const max = getGuildSettings(i.guildId).selfRoles.maxPerMenu || 25;
            if (options.length >= max) return err(i, "Menu Full", `A menu can hold at most **${max}** roles.`);
            if (options.some((o) => o.role_id === role.id)) return err(i, "Already Added", "That role is already in this menu.");

            const label = (i.options.getString("label") || role.name).slice(0, 80);
            const emoji = i.options.getString("emoji")?.slice(0, 64) || null;
            const style = i.options.getString("style") || "Secondary";

            await db.run(
                "INSERT INTO self_role_options (menu_id, role_id, label, emoji, style, position) VALUES (?, ?, ?, ?, ?, ?)",
                menu.id, role.id, label, emoji, style, options.length
            );
            await refreshMenuMessage(i.client, menu);
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title: "Role Added", description: `Added ${role} to the menu.`, ephemeral: true }));
        }

        if (sub === "remove") {
            const messageId = i.options.getString("message_id");
            const role = i.options.getRole("role");
            const menu = await getMenuByMessage(i.guildId, messageId);
            if (!menu) return err(i, "Menu Not Found", "No self-role menu with that message ID in this server.");

            const res = await db.run("DELETE FROM self_role_options WHERE menu_id = ? AND role_id = ?", menu.id, role.id);
            if (!res.changes) return err(i, "Not in Menu", "That role isn't in this menu.");
            await refreshMenuMessage(i.client, menu);
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title: "Role Removed", description: `Removed ${role} from the menu.`, ephemeral: true }));
        }

        if (sub === "list") {
            const menus = await db.all("SELECT * FROM self_role_menus WHERE guild_id = ? ORDER BY id ASC", i.guildId);
            if (!menus.length) return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "No Menus", description: "This server has no self-role menus yet. Create one with `/selfroles create`.", ephemeral: true }));

            const lines = [];
            for (const m of menus) {
                const opts = await getMenuOptions(m.id);
                lines.push(`**${m.title}** — <#${m.channel_id}> · \`${m.message_id}\` · ${opts.length} role(s) · ${m.mode}`);
            }
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "Self-Role Menus", description: lines.join("\n").slice(0, 4000), ephemeral: true }));
        }

        if (sub === "delete") {
            const messageId = i.options.getString("message_id");
            const menu = await getMenuByMessage(i.guildId, messageId);
            if (!menu) return err(i, "Menu Not Found", "No self-role menu with that message ID in this server.");

            await db.run("DELETE FROM self_role_options WHERE menu_id = ?", menu.id);
            await db.run("DELETE FROM self_role_menus WHERE id = ?", menu.id);

            const channel = await i.client.channels.fetch(menu.channel_id).catch(() => null);
            if (channel?.isTextBased()) {
                const msg = await channel.messages.fetch(menu.message_id).catch(() => null);
                if (msg) await msg.delete().catch(() => null);
            }
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title: "Menu Deleted", description: "The self-role menu was removed.", ephemeral: true }));
        }
    },
};
