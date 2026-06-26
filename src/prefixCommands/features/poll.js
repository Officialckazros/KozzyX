import { replyEmbed } from "../../utils/embeds.js";

export default {
    name: "poll",
    async execute(message, args) {
        const parts = args.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
        if (parts.length < 3) {
            return replyEmbed(message, {
                type: "error", title: "Usage",
                description: "`,poll Question | Option 1 | Option 2 [| ...]`\nUp to 8 options.",
            });
        }
        const [question, ...answers] = parts;
        try {
            await message.channel.send({
                poll: {
                    question: { text: question.slice(0, 300) },
                    answers: answers.slice(0, 8).map((a) => ({ text: a.slice(0, 55) })),
                    duration: 24,
                    allowMultiselect: false,
                },
            });
        } catch (err) {
            console.error("[poll prefix] error:", err);
            return replyEmbed(message, { type: "error", title: "Poll Failed", description: "I couldn't create that poll. Check my permissions in this channel." });
        }
    },
};
