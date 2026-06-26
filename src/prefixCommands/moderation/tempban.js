import { PermissionsBitField } from "discord.js";
import { replyEmbed, postCase } from "../../utils/embeds.js";
import { parseDurationToMs } from "../../utils/helpers.js";
import { validateModAction, createCase, trySendModDM, buildModEmbed, formatDuration } from "../../utils/moderationUtils.js";
import { getGuildSettings } from "../../utils/database.js";
import { addTempBan } from "../../utils/tempbans.js";

const MAX_TEMPBAN_MS = 365 * 24 * 60 * 60 * 1000;

export default {
    name: "tempban",
    aliases: ["tb"],
    meta: {
        requiredUserPermissions: [PermissionsBitField.Flags.BanMembers],
        requiredBotPermissions: [PermissionsBitField.Flags.BanMembers],
    },
    async execute(message, args) {
        const target = message.mentions.users.first()
            || (args[0] && /^\d{16,21}$/.test(args[0]) ? await message.client.users.fetch(args[0]).catch(() => null) : null);

        if (!target) {
            return replyEmbed(message, { type: "error", title: "Usage", description: "`,tempban @user <duration> [reason]`\nExample: `,tempban @user 7d spamming`" });
        }

        let rest = message.mentions.users.first()
            ? args.filter((a) => !/^<@!?\d+>$/.test(a))
            : args.slice(1);

        const ms = parseDurationToMs(rest.shift());
        if (!ms || ms <= 0) {
            return replyEmbed(message, { type: "error", title: "Invalid Duration", description: "Provide a duration like `30m`, `2h`, `7d` after the user." });
        }
        if (ms > MAX_TEMPBAN_MS) {
            return replyEmbed(message, { type: "error", title: "Too Long", description: "Temp-bans cannot exceed **1 year**." });
        }

        const settings = getGuildSettings(message.guild.id);
        const reason = rest.join(" ").trim() || settings.moderation.defaultReason;

        const v = validateModAction({ executor: message.member, target, action: "tempban", requireMember: false });
        if (!v.ok) return replyEmbed(message, { type: "error", title: "Cannot Ban", description: v.reason });

        if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return replyEmbed(message, { type: "error", title: "Bot Missing Permission", description: "I need **Ban Members**." });
        }

        try {
            const existing = await message.guild.bans.fetch(target.id).catch(() => null);
            if (existing) return replyEmbed(message, { type: "error", title: "Already Banned", description: "That user is already banned." });

            const durationText = formatDuration(ms);
            const caseNumber = await createCase({ guild: message.guild, action: "tempban", target, executor: message.author, reason, durationMs: ms });
            const appealNote = `\n\nTo appeal, use \`/appeal\` in any server with this bot and provide server ID \`${message.guild.id}\`.`;

            if (settings.moderation.dmOnAction) {
                await trySendModDM({ user: target, guild: message.guild, type: "mod", title: "You were temporarily banned", description: `You have been temporarily banned from the server.${appealNote}`, moderatorTag: message.author.tag, reason, durationText, caseNumber });
            }

            await message.guild.members.ban(target.id, { reason: `${message.author.tag}: ${reason}` });
            await addTempBan({ guildId: message.guild.id, userId: target.id, unbanAt: Date.now() + ms, reason, executorId: message.author.id });

            const embed = buildModEmbed({ guild: message.guild, type: "mod", title: "Member Temporarily Banned", target, executor: message.author, reason, caseNumber, durationText });
            await message.reply({ embeds: [embed] });
            await postCase(message.guild, embed, message.channel.id);
        } catch (err) {
            console.error("Tempban error:", err);
            return replyEmbed(message, { type: "error", title: "Tempban Failed", description: "Failed to ban that user." });
        }
    },
};
