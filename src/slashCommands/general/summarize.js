import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { askGemini } from "../../utils/ai.js";

const cooldowns = new Map();
const COOLDOWN_SECONDS = 60;

export default {
    data: {
        name: "summarize",
        description: "Summarize the last few messages",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            { name: "limit", description: "Number of messages (default 20, max 50)", type: 4, required: false }
        ]
    },
    async execute(i) {
        if (!i.channel || !i.channel.messages) {
            return safeRespond(i, { content: "I cannot read messages in this context. The bot must be in the server and have permission to read message history.", ephemeral: true });
        }

        const now = Date.now();
        const cooldownEnd = cooldowns.get(i.user.id);

        if (cooldownEnd && now < cooldownEnd) {
            const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "⏰ Cooldown Active",
                description: `Please wait ${timeLeft} seconds before using this command again. Summarization is resource intensive.`,
                ephemeral: true,
            }));
        }

        const limit = Math.min(Math.max(i.options.getInteger("limit") || 20, 5), 50);
        await i.deferReply();

        try {
            const messages = await i.channel.messages.fetch({ limit });
            const transcript = messages.reverse().map(m => `${m.author.username}: ${m.content}`).join("\n");

            if (!transcript.trim()) {
                return safeRespond(i, { content: "No text messages found to summarize.", ephemeral: true });
            }

            const prompt = `Summarize the following Discord conversation concisely:\n\n${transcript}`;
            const summary = await askGemini(prompt);

            if (summary === "BLOCKED") {
                return safeRespond(i, asEmbedPayload({
                    guildId: i.guild?.id,
                    type: "error",
                    title: "Blocked",
                    description: "The conversation content was blocked due to a safety violation.",
                    ephemeral: true,
                }));
            }

            if (summary === "MISSING_API_KEY") {
                return safeRespond(i, asEmbedPayload({
                    guildId: i.guild?.id,
                    type: "error",
                    title: "Configuration Error",
                    description: "The Gemini API key is missing. Please configure `GOOGLE_GENERATIVE_AI_API_KEY` in the bot's `.env` file on the server.",
                    ephemeral: true,
                }));
            }

            if (summary === "INVALID_API_KEY") {
                return safeRespond(i, asEmbedPayload({
                    guildId: i.guild?.id,
                    type: "error",
                    title: "Authentication Error",
                    description: "The configured Gemini API key is invalid. Please check the `GOOGLE_GENERATIVE_AI_API_KEY` in the bot's `.env` file on the server.",
                    ephemeral: true,
                }));
            }

            if (!summary || summary === "ERROR") {
                return safeRespond(i, asEmbedPayload({
                    guildId: i.guild?.id,
                    type: "error",
                    title: "AI Error",
                    description: "Failed to generate summary. Please try again later.",
                    ephemeral: true,
                }));
            }

            if (summary === "QUOTA_EXCEEDED") {
                return safeRespond(i, asEmbedPayload({
                    guildId: i.guild?.id,
                    type: "error",
                    title: "Quota Exceeded",
                    description: "The bot's AI quota has been reached. Please try again tomorrow or wait a few minutes.",
                    ephemeral: true,
                }));
            }

            cooldowns.set(i.user.id, now + (COOLDOWN_SECONDS * 1000));

            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "info",
                title: "Conversation Summary",
                description: summary,
                footerUser: i.user,
                client: i.client,
            }));

        } catch (e) {
            console.error("Summarize error:", e);
            if (e.code === 50001) {
                return safeRespond(i, { content: "I don't have permission to read message history in this channel.", ephemeral: true });
            }
            return safeRespond(i, { content: "Error fetching messages or summarizing: " + (e.message || "Unknown error"), ephemeral: true });
        }
    }
};
