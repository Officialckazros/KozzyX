import { PermissionsBitField } from "discord.js";
import { safeRespond, parseDurationToMs } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";
import { getGuildSettings } from "../../utils/database.js";
import { createGiveaway, endGiveaway } from "../../utils/giveaways.js";

const MAX_GIVEAWAY_MS = 60 * 24 * 60 * 60 * 1000;

function err(i, title, description) {
    return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title, description, ephemeral: true }));
}

export default {
    meta: {
        category: "general",
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
        requiredBotPermissions: [PermissionsBitField.Flags.SendMessages],
    },
    data: {
        name: "giveaway",
        description: "Start and manage giveaways",
        dm_permission: false,
        contexts: [0],
        default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
        options: [
            {
                name: "start", description: "Start a new giveaway", type: 1,
                options: [
                    { name: "prize", description: "What are you giving away?", type: 3, required: true },
                    { name: "duration", description: "How long? (e.g. 1h, 1d, 7d)", type: 3, required: true },
                    { name: "winners", description: "Number of winners", type: 4, required: false, min_value: 1, max_value: 50 },
                    { name: "channel", description: "Channel (defaults to current)", type: 7, required: false, channel_types: [0, 5] },
                    { name: "required_role", description: "Only members with this role can win", type: 8, required: false },
                ],
            },
            {
                name: "end", description: "End a giveaway now and draw winners", type: 1,
                options: [{ name: "giveaway_id", description: "Giveaway ID (see /giveaway list)", type: 4, required: true }],
            },
            {
                name: "reroll", description: "Reroll winners for an ended giveaway", type: 1,
                options: [{ name: "giveaway_id", description: "Giveaway ID", type: 4, required: true }],
            },
            { name: "list", description: "List active giveaways", type: 1 },
        ],
    },
    async execute(i) {
        const sub = i.options.getSubcommand();
        const db = await getDB();

        if (sub === "start") {
            const prize = i.options.getString("prize").slice(0, 250);
            const durationStr = i.options.getString("duration");
            const defaults = getGuildSettings(i.guildId).giveaway;
            const winners = i.options.getInteger("winners") || defaults.defaultWinners || 1;
            const channel = i.options.getChannel("channel") || i.channel;
            const requiredRole = i.options.getRole("required_role");

            if (!channel?.isTextBased?.()) return err(i, "Invalid Channel", "Pick a text channel.");

            const durationMs = parseDurationToMs(durationStr);
            if (!durationMs || durationMs <= 0) return err(i, "Invalid Duration", "Use formats like `30m`, `1h`, `1d`, `7d`.");
            if (durationMs > MAX_GIVEAWAY_MS) return err(i, "Too Long", "Giveaways cannot run longer than **60 days**.");

            const { id } = await createGiveaway({
                guild: i.guild, channel, prize, winners, durationMs,
                hostId: i.user.id, requiredRoleId: requiredRole?.id || defaults.requiredRoleId || null,
            });

            return safeRespond(i, asEmbedPayload({
                guildId: i.guildId, type: "success", title: "Giveaway Started",
                description: `Giveaway **#${id}** for **${prize}** is live in ${channel}.`,
                ephemeral: true,
            }));
        }

        if (sub === "end") {
            const id = i.options.getInteger("giveaway_id");
            const gw = await db.get("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", id, i.guildId);
            if (!gw) return err(i, "Not Found", "No giveaway with that ID in this server.");
            if (gw.status === "ended") return err(i, "Already Ended", "That giveaway has already ended. Use `/giveaway reroll` to draw new winners.");

            await endGiveaway(i.client, id);
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "success", title: "Giveaway Ended", description: `Giveaway **#${id}** ended and winners drawn.`, ephemeral: true }));
        }

        if (sub === "reroll") {
            const id = i.options.getInteger("giveaway_id");
            const gw = await db.get("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", id, i.guildId);
            if (!gw) return err(i, "Not Found", "No giveaway with that ID in this server.");
            if (gw.status !== "ended") return err(i, "Not Ended", "You can only reroll a giveaway that has ended.");

            const res = await endGiveaway(i.client, id, { reroll: true });
            return safeRespond(i, asEmbedPayload({
                guildId: i.guildId, type: res.winnerIds?.length ? "success" : "warning",
                title: "Giveaway Rerolled",
                description: res.winnerIds?.length ? `New winner(s) drawn for **#${id}**.` : "No valid entries to reroll.",
                ephemeral: true,
            }));
        }

        if (sub === "list") {
            const rows = await db.all("SELECT * FROM giveaways WHERE guild_id = ? AND status = 'active' ORDER BY end_time ASC", i.guildId);
            if (!rows.length) return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "No Active Giveaways", description: "Start one with `/giveaway start`.", ephemeral: true }));

            const lines = [];
            for (const gw of rows) {
                const c = await db.get("SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?", gw.id);
                lines.push(`**#${gw.id}** - ${gw.prize} · ${gw.winners} winner(s) · ${c?.c ?? 0} entries · ends <t:${Math.floor(gw.end_time / 1000)}:R> · <#${gw.channel_id}>`);
            }
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "info", title: "Active Giveaways", description: lines.join("\n").slice(0, 4000), ephemeral: true }));
        }
    },
};
