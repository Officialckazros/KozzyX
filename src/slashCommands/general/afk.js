import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { setAfk } from "../../utils/database.js";

export default {
    data: {
        name: "afk", description: "Set your AFK status", options: [
            { name: "reason", description: "AFK reason", type: 3, required: false }
        ]
    },
    async execute(interaction) {
        const reason = (interaction.options.getString("reason") || "AFK").slice(0, 256);
        await setAfk(interaction.user.id, reason);
        return safeRespond(interaction, asEmbedPayload({
            guildId: interaction.guild?.id,
            type: "afk",
            title: "AFK Enabled",
            description: `You are now AFK: **${reason}**\nI will let people know when they mention you, and remove it as soon as you send a message.`,
            ephemeral: true,
        }));
    }
};
