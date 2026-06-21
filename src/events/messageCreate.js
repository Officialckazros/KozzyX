import { Events } from "discord.js";
import { replyEmbed } from "../utils/embeds.js";
import { checkMassMention } from "../utils/raidProtection.js";
import { isCommandEnabled, checkCooldown } from "../dashboard-api.js";
import { afkMap, clearAfk, getGuildSettings } from "../utils/database.js";
import { generateSlavicReply } from "../utils/ai.js";

const MOD_PREFIX = ",";
const CONFIG_PREFIX = "!";

const AFK_PING_NOTIFY_COOLDOWN_MS = 30_000;
const afkPingNotifiedAt = new Map();

const SLAVIC_COOLDOWN_MS = 20_000;
const slavicCooldown = new Map();

setInterval(() => {
    const cutoff = Date.now() - AFK_PING_NOTIFY_COOLDOWN_MS;
    for (const [key, ts] of afkPingNotifiedAt) {
        if (ts < cutoff) afkPingNotifiedAt.delete(key);
    }
}, 5 * 60_000);

setInterval(() => {
    const cutoff = Date.now() - SLAVIC_COOLDOWN_MS * 10;
    for (const [key, ts] of slavicCooldown) {
        if (ts < cutoff) slavicCooldown.delete(key);
    }
}, 10 * 60_000);

async function handleSlavicAutoResponse(message) {
    if (!message?.guild || message.author?.bot) return;

    const settings = getGuildSettings(message.guild.id);
    if (!settings.slavicResponseEnabled) return;

    const content = (message.content || "").trim();
    if (!content || content.length < 3) return;

    const now = Date.now();
    const last = slavicCooldown.get(message.author.id) || 0;
    if (now - last < SLAVIC_COOLDOWN_MS) return;
    slavicCooldown.set(message.author.id, now);

    const replyText = await generateSlavicReply(content);
    if (!replyText) return;

    try {
        await message.reply({ content: replyText, allowedMentions: { repliedUser: false } });
    } catch (err) {
        console.error("[slavic-response] Failed to reply:", err?.message || err);
    }
}

function formatAfkDuration(ms) {
    const totalMinutes = Math.floor(ms / 60_000);
    if (totalMinutes < 1) return "less than a minute";
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(" ");
}

async function handleAfkReturn(message, isSettingAfk) {
    const entry = afkMap.get(message.author.id);
    if (!entry || isSettingAfk) return;

    await clearAfk(message.author.id);
    await replyEmbed(message, {
        type: "afk",
        title: "Welcome back!",
        description: `Glad to see you again, ${message.author}. I removed your AFK status — you were away for **${formatAfkDuration(Date.now() - entry.since)}**.`,
        allowedMentions: { repliedUser: false, parse: [] },
    });
}

async function handleAfkMentions(message) {
    if (message.mentions.users.size === 0 || message.mentions.users.size > 20) return;

    const lines = [];
    for (const user of message.mentions.users.values()) {
        if (user.id === message.author.id || user.bot) continue;
        const entry = afkMap.get(user.id);
        if (!entry) continue;

        const key = `${message.channel.id}:${user.id}`;
        const last = afkPingNotifiedAt.get(key);
        if (last && Date.now() - last < AFK_PING_NOTIFY_COOLDOWN_MS) continue;
        afkPingNotifiedAt.set(key, Date.now());

        lines.push(`**${user.displayName ?? user.username}** is currently AFK: **${entry.reason}** (since <t:${Math.floor(entry.since / 1000)}:R>)`);
    }

    if (lines.length === 0) return;
    await replyEmbed(message, {
        type: "afk",
        title: lines.length === 1 ? "User is AFK" : "Users are AFK",
        description: lines.join("\n"),
        allowedMentions: { repliedUser: false, parse: [] },
    });
}

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        try {
            if (!message?.content || message.author.bot) return;
            if (!message.guild) return;

            const blocked = await checkMassMention(message);
            if (blocked) return;

            handleSlavicAutoResponse(message).catch(err => console.error("[slavic] handler error:", err));

            const raw = message.content;
            const isConfig = raw.startsWith(CONFIG_PREFIX);
            const isMod = raw.startsWith(MOD_PREFIX);

            const isSettingAfk = isMod && raw.slice(MOD_PREFIX.length).trim().toLowerCase().startsWith("afk");
            await handleAfkReturn(message, isSettingAfk).catch(err => console.error("[afk] return error:", err));
            await handleAfkMentions(message).catch(err => console.error("[afk] mention error:", err));

            if (!isConfig && !isMod) return;

            const prefix = isConfig ? CONFIG_PREFIX : MOD_PREFIX;
            const args = raw.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift()?.toLowerCase();
            if (!commandName) return;

            const command = client.prefixCommands.get(commandName)
                || client.prefixCommands.get(client.aliases.get(commandName));

            if (!command) return;

            if (isConfig && !command.config) return;
            if (isMod && command.config) return;

            if (!isCommandEnabled("prefix", command.name)) {
                return replyEmbed(message, {
                    type: "error",
                    title: "Command Disabled",
                    description: `The \`${command.name}\` command is currently disabled from the dashboard.`,
                });
            }

            const cd = checkCooldown("prefix", command.name, message.author.id);
            if (!cd.ok) {
                return replyEmbed(message, {
                    type: "warning",
                    title: "Slow Down",
                    description: `Wait **${cd.remaining}s** before using \`${command.name}\` again.`,
                });
            }

            try {
                await command.execute(message, args, client);
            } catch (error) {
                console.error("[messageCreate] Command execution error:", error);
                await replyEmbed(message, {
                    type: "error",
                    title: "Something went wrong",
                    description: "There was an error while executing this command!",
                });
            }
        } catch (err) {
            console.error("[messageCreate] Error:", err);
        }
    }
};
