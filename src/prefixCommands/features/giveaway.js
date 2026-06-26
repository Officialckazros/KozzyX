import { PermissionsBitField } from "discord.js";
import { replyEmbed } from "../../utils/embeds.js";
import { parseDurationToMs } from "../../utils/helpers.js";
import { getDB } from "../../utils/db.js";
import { getGuildSettings } from "../../utils/database.js";
import { createGiveaway, endGiveaway } from "../../utils/giveaways.js";

const MAX_GIVEAWAY_MS = 60 * 24 * 60 * 60 * 1000;

export default {
    name: "giveaway",
    aliases: ["gw"],
    meta: {
        requiredUserPermissions: [PermissionsBitField.Flags.ManageGuild],
        requiredBotPermissions: [PermissionsBitField.Flags.SendMessages],
    },
    async execute(message, args) {
        const sub = (args[0] || "").toLowerCase();
        const db = await getDB();

        if (sub === "start") {
            const ms = parseDurationToMs(args[1]);
            if (!ms || ms <= 0) {
                return replyEmbed(message, { type: "error", title: "Usage", description: "`,giveaway start <duration> [winners] <prize>`\nExample: `,giveaway start 1d 2 Discord Nitro`" });
            }
            if (ms > MAX_GIVEAWAY_MS) return replyEmbed(message, { type: "error", title: "Too Long", description: "Giveaways cannot run longer than **60 days**." });

            const defaults = getGuildSettings(message.guild.id).giveaway;
            let idx = 2;
            let winners = defaults.defaultWinners || 1;
            if (/^\d+$/.test(args[2] || "")) {
                winners = Math.min(50, Math.max(1, parseInt(args[2], 10)));
                idx = 3;
            }
            const prize = args.slice(idx).join(" ").trim();
            if (!prize) return replyEmbed(message, { type: "error", title: "Usage", description: "Provide a prize. `,giveaway start 1d 2 Nitro`" });

            const { id } = await createGiveaway({
                guild: message.guild, channel: message.channel, prize: prize.slice(0, 250),
                winners, durationMs: ms, hostId: message.author.id, requiredRoleId: defaults.requiredRoleId || null,
            });
            return replyEmbed(message, { type: "success", title: "Giveaway Started", description: `Giveaway **#${id}** for **${prize}** is live.` });
        }

        if (sub === "end" || sub === "reroll") {
            const id = parseInt(args[1], 10);
            if (!Number.isFinite(id)) return replyEmbed(message, { type: "error", title: "Usage", description: `\`,giveaway ${sub} <id>\`` });
            const gw = await db.get("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", id, message.guild.id);
            if (!gw) return replyEmbed(message, { type: "error", title: "Not Found", description: "No giveaway with that ID in this server." });
            if (sub === "end" && gw.status === "ended") return replyEmbed(message, { type: "error", title: "Already Ended", description: "That giveaway already ended. Use `,giveaway reroll <id>`." });
            if (sub === "reroll" && gw.status !== "ended") return replyEmbed(message, { type: "error", title: "Not Ended", description: "You can only reroll an ended giveaway." });

            const res = await endGiveaway(message.client, id, { reroll: sub === "reroll" });
            return replyEmbed(message, {
                type: res.winnerIds?.length ? "success" : "warning",
                title: sub === "reroll" ? "Giveaway Rerolled" : "Giveaway Ended",
                description: res.winnerIds?.length ? `Winner(s) drawn for **#${id}**.` : "No valid entries.",
            });
        }

        if (sub === "list") {
            const rows = await db.all("SELECT * FROM giveaways WHERE guild_id = ? AND status = 'active' ORDER BY end_time ASC", message.guild.id);
            if (!rows.length) return replyEmbed(message, { type: "info", title: "No Active Giveaways", description: "Start one with `,giveaway start`." });
            const lines = [];
            for (const gw of rows) {
                const c = await db.get("SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?", gw.id);
                lines.push(`**#${gw.id}** - ${gw.prize} · ${gw.winners} winner(s) · ${c?.c ?? 0} entries · ends <t:${Math.floor(gw.end_time / 1000)}:R>`);
            }
            return replyEmbed(message, { type: "info", title: "Active Giveaways", description: lines.join("\n").slice(0, 4000) });
        }

        return replyEmbed(message, { type: "error", title: "Usage", description: "`,giveaway start <duration> [winners] <prize>`\n`,giveaway end <id>`\n`,giveaway reroll <id>`\n`,giveaway list`" });
    },
};
