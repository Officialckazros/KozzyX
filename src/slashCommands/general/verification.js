import { PermissionsBitField } from "discord.js";
import { safeRespond, parseDurationToMs } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getGuildSettings, saveSettings } from "../../utils/database.js";
import { buildVerifyPanel } from "../../utils/verification.js";
import { formatDuration } from "../../utils/moderationUtils.js";

function err(i, title, description) {
    return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title, description, ephemeral: true }));
}

export default {
    meta: {
        category: "general",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
        requiredBotPermissions: [PermissionsBitField.Flags.ManageRoles],
    },
    data: {
        name: "verification",
        description: "Set up and manage the verification gate",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
        options: [
            {
                name: "setup", description: "Configure and post the verification panel", type: 1,
                options: [
                    { name: "channel", description: "Channel to post the panel in", type: 7, required: true, channel_types: [0, 5] },
                    { name: "role", description: "Role granted on verification", type: 8, required: true },
                    { name: "title", description: "Panel title", type: 3, required: false },
                    { name: "description", description: "Panel description", type: 3, required: false },
                    { name: "button_label", description: "Verify button text", type: 3, required: false },
                    { name: "min_account_age", description: "Minimum account age (e.g. 7d). Blocks brand-new accounts.", type: 3, required: false },
                ],
            },
            { name: "disable", description: "Turn off verification", type: 1 },
            { name: "status", description: "Show the current verification configuration", type: 1 },
        ],
    },
    async execute(i) {
        const sub = i.options.getSubcommand();
        const settings = getGuildSettings(i.guildId);
        const v = settings.verification;

        if (sub === "status") {
            const lines = [
                `**Enabled:** ${v.enabled ? "Yes" : "No"}`,
                `**Role:** ${v.roleId ? `<@&${v.roleId}>` : "-"}`,
                `**Channel:** ${v.channelId ? `<#${v.channelId}>` : "-"}`,
                `**Button:** ${v.buttonLabel}`,
                `**Min account age:** ${v.minAccountAgeMs > 0 ? formatDuration(v.minAccountAgeMs) : "None"}`,
            ];
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "Verification", description: lines.join("\n"), ephemeral: true }));
        }

        if (sub === "disable") {
            v.enabled = false;
            await saveSettings();
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title: "Verification Disabled", description: "The verify button will no longer grant roles. Existing panels stay until deleted.", ephemeral: true }));
        }

        // setup
        const channel = i.options.getChannel("channel");
        const role = i.options.getRole("role");
        if (!channel?.isTextBased?.()) return err(i, "Invalid Channel", "Pick a text channel.");
        if (role.managed || role.id === i.guild.id) return err(i, "Invalid Role", "That role can't be used for verification.");

        const me = i.guild.members.me;
        if (me.roles.highest.position <= role.position) return err(i, "Role Too High", `**${role.name}** is above my highest role, so I can't assign it. Move my role higher.`);

        let minAgeMs = v.minAccountAgeMs;
        const ageStr = i.options.getString("min_account_age");
        if (ageStr) {
            const parsed = parseDurationToMs(ageStr);
            if (parsed === null) return err(i, "Invalid Duration", "Use formats like `1d`, `7d`, `30d`. Use `off` to clear.");
            minAgeMs = parsed;
        }

        v.enabled = true;
        v.channelId = channel.id;
        v.roleId = role.id;
        v.minAccountAgeMs = minAgeMs;
        if (i.options.getString("title")) v.title = i.options.getString("title").slice(0, 256);
        if (i.options.getString("description")) v.description = i.options.getString("description").slice(0, 2000);
        if (i.options.getString("button_label")) v.buttonLabel = i.options.getString("button_label").slice(0, 80);

        const panel = buildVerifyPanel(i.guildId);
        const msg = await channel.send(panel).catch(() => null);
        if (!msg) return err(i, "Failed", "I couldn't post in that channel. Check my permissions.");
        v.messageId = msg.id;
        await saveSettings();

        return safeRespond(i, asEmbedPayload({
            guildId: i.guildId, type: "success", title: "Verification Set Up",
            description: `Posted the verification panel in ${channel}. Members who click **${v.buttonLabel}** will receive ${role}.`,
            ephemeral: true,
        }));
    },
};
