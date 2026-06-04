import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";

export default {
    data: {
        name: "lookup_disable",
        description: "Disable lookups of your profile by other users"
    },
    async execute(interaction) {
        const db = await getDB();
        const userId = interaction.user.id;

        try {
            await db.run("INSERT OR IGNORE INTO blocked_lookups (user_id) VALUES (?)", userId);
            return safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guild?.id,
                type: "success",
                title: "Lookup Disabled",
                description: "Other users can no longer retrieve your information using `/lookup`.",
                ephemeral: true
            }));
        } catch (err) {
            console.error("Error running lookup_disable:", err);
            return safeRespond(interaction, asEmbedPayload({
                guildId: interaction.guild?.id,
                type: "error",
                title: "Something went wrong",
                description: "An error occurred while disabling lookups for your profile.",
                ephemeral: true
            }));
        }
    }
};
