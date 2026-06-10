import { setAfk } from "../../utils/database.js";
import { replyEmbed } from "../../utils/embeds.js";

export default {
    name: "afk",
    async execute(message, args) {
        const reason = (args.join(" ").trim() || "AFK").slice(0, 256);
        await setAfk(message.author.id, reason);
        return replyEmbed(message, {
            type: "afk",
            title: "AFK Enabled",
            description: `You are now AFK: **${reason}**\nI will let people know when they mention you, and remove it as soon as you send a message.`,
            allowedMentions: { repliedUser: false, parse: [] },
        });
    }
};
