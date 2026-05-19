import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";

export default {
    data: {
        name: "lookup_enable",
        description: "Enable lookups of your profile by other users"
    },
    async execute(interaction) {
        const db = await getDB();
        const userId = interaction.user.id;

        try {
            await db.run("DELETE FROM blocked_lookups WHERE user_id = ?", userId);
            return safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guild?.id,
                type: "success",
                title: "🔓 Lookup Enabled",
                description: "Other users can now retrieve your information using `/lookup`.",
                ephemeral: true
            }));
        } catch (err) {
            console.error("Error running lookup_enable:", err);
            return safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guild?.id,
                type: "error",
                title: "❌ Error",
                description: "An error occurred while enabling lookups for your profile.",
                ephemeral: true
            }));
        }
    }
};
