import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";

export default {
    data: { 
        name: "coinflip", 
        description: "Flip a coin",
        integration_types: [0, 1],
        contexts: [0, 1, 2]
    },
    async execute(i) {
        const res = Math.random() < 0.5 ? "Heads" : "Tails";
        return safeRespond(i, asEmbedPayload({
            guildId: i.guild?.id,
            type: "info",
            title: "🪙 Coin Flip",
            description: `It's **${res}**!`,
            footerUser: i.user,
            client: i.client
        }));
    }
};
