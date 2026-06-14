import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { askGemini, askGeminiWithHistory } from "../../utils/ai.js";
import { getGuildSettings } from "../../utils/database.js";
import { getConversation, setConversation } from "../../utils/conversationMemory.js";

const cooldowns = new Map();
const COOLDOWN_SECONDS = 30;
const MAX_HISTORY = 20;

setInterval(() => {
    const now = Date.now();
    for (const [userId, cooldownEnd] of cooldowns) {
        if (now >= cooldownEnd) cooldowns.delete(userId);
    }
}, 10 * 60 * 1000);

export default {
    data: {
        name: "ask",
        description: "Ask Gemini AI a question",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            { name: "prompt", description: "Your question", type: 3, required: true }
        ]
    },
    async execute(i) {
        const now = Date.now();
        const cooldownEnd = cooldowns.get(i.user.id);

        if (cooldownEnd && now < cooldownEnd) {
            const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "Cooldown Active",
                description: `Please wait ${timeLeft} seconds before using this command again.`,
                ephemeral: true,
            }));
        }

        const prompt = i.options.getString("prompt");
        await i.deferReply();

        const guildId = i.guild?.id ?? "dm";
        const settings = i.guild ? getGuildSettings(guildId) : null;
        const useHistory = settings?.plugins?.conversation_memory ?? false;

        let answer;

        if (useHistory) {
            const history = getConversation(i.user.id, guildId);
            history.push({ role: "user", content: prompt });
            answer = await askGeminiWithHistory(history);

            if (answer && answer !== "ERROR" && answer !== "QUOTA_EXCEEDED") {
                history.push({ role: "assistant", content: answer });
                const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
                setConversation(i.user.id, guildId, trimmed);
            }
        } else {
            answer = await askGemini(prompt);
        }

        if (answer === "BLOCKED") {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "Blocked",
                description: "Your message was blocked because it appears to contain a prompt injection or jailbreak attempt.",
                ephemeral: true,
            }));
        }

        if (answer === "MISSING_API_KEY") {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "Configuration Error",
                description: "The Gemini API key is missing. Please configure `GOOGLE_GENERATIVE_AI_API_KEY` in the bot's `.env` file on the server.",
                ephemeral: true,
            }));
        }

        if (answer === "INVALID_API_KEY") {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "Authentication Error",
                description: "The configured Gemini API key is invalid. Please check the `GOOGLE_GENERATIVE_AI_API_KEY` in the bot's `.env` file on the server.",
                ephemeral: true,
            }));
        }

        if (!answer || answer === "ERROR") {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "AI Error",
                description: "Failed to get a response from Gemini. Please try again later.",
                ephemeral: true,
            }));
        }

        if (answer === "QUOTA_EXCEEDED") {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "Quota Exceeded",
                description: "The bot's AI quota has been reached. Please try again later.",
                ephemeral: true,
            }));
        }

        cooldowns.set(i.user.id, now + (COOLDOWN_SECONDS * 1000));

        const trimmed = answer.length > 4000 ? answer.slice(0, 3997) + "..." : answer;
        const footer = useHistory ? "Conversation memory is ON — kept in memory only, forgotten after 30 min idle or on restart." : null;

        return safeRespond(i, asEmbedPayload({
            guildId: i.guild?.id,
            type: "info",
            title: "Gemini Answer",
            description: `**Q:** ${prompt}\n\n${trimmed}`,
            footerUser: footer ? null : i.user,
            client: i.client,
            ...(footer ? { fields: [{ name: "\u200b", value: footer }] } : {}),
        }));
    }
};
