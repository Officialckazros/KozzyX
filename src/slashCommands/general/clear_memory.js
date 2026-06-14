import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { clearConversation } from "../../utils/conversationMemory.js";

export default {
    data: {
        name: "clear_memory",
        description: "Clear Gemini's conversation history for you in this server.",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
    },
    async execute(i) {
        const guildId = i.guild?.id ?? "dm";
        const cleared = clearConversation(i.user.id, guildId);
        return safeRespond(i, asEmbedPayload({
            guildId: i.guild?.id,
            type: cleared ? "success" : "info",
            title: cleared ? "Memory Cleared" : "Nothing to Clear",
            description: cleared
                ? "Gemini's conversation history for you in this server has been wiped. Next `/ask` starts fresh."
                : "You have no stored conversation history here.",
            ephemeral: true,
        }));
    },
};
