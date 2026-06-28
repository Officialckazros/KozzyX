import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";

const MAX_POLL_HOURS = 768;

export default {
    meta: { category: "general" },
    data: {
        name: "poll",
        description: "Create a native Discord poll",
        dm_permission: false,
        contexts: [0],
        options: [
            { name: "question", description: "The poll question", type: 3, required: true },
            { name: "answer1", description: "First answer", type: 3, required: true },
            { name: "answer2", description: "Second answer", type: 3, required: true },
            { name: "answer3", description: "Third answer", type: 3, required: false },
            { name: "answer4", description: "Fourth answer", type: 3, required: false },
            { name: "answer5", description: "Fifth answer", type: 3, required: false },
            { name: "answer6", description: "Sixth answer", type: 3, required: false },
            { name: "answer7", description: "Seventh answer", type: 3, required: false },
            { name: "answer8", description: "Eighth answer", type: 3, required: false },
            { name: "duration_hours", description: "How long the poll runs (hours, default 24)", type: 4, required: false, min_value: 1, max_value: MAX_POLL_HOURS },
            { name: "multiselect", description: "Allow voting for multiple answers", type: 5, required: false },
        ],
    },
    async execute(i) {
        const question = i.options.getString("question").slice(0, 300);
        const answers = [];
        for (let n = 1; n <= 8; n++) {
            const text = i.options.getString(`answer${n}`);
            if (text) answers.push({ text: text.slice(0, 55) });
        }

        if (answers.length < 2) {
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Not Enough Answers", description: "Provide at least two answers.", ephemeral: true }));
        }

        const duration = i.options.getInteger("duration_hours") || 24;
        const allowMultiselect = i.options.getBoolean("multiselect") || false;

        try {
            return await i.reply({
                poll: {
                    question: { text: question },
                    answers,
                    duration,
                    allowMultiselect,
                },
            });
        } catch (err) {
            console.error("[poll] error:", err);
            return safeRespond(i, asEmbedPayload({ guildId: i.guildId, type: "error", title: "Poll Failed", description: "I couldn't create that poll. I may be missing permissions in this channel.", ephemeral: true }));
        }
    },
};
