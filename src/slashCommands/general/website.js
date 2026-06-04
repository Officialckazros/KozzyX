import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { asEmbedPayload } from "../../utils/embeds.js";

export default {
    data: {
        name: "website",
        description: "Get the link to our official website!",
    },

    async execute(interaction) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel("Visit Website")
                    .setURL("https://kozzyx.org")
                    .setStyle(ButtonStyle.Link)
            );

        return safeRespond(interaction, asEmbedPayload({
            guildId: interaction.guildId,
            type: "info",
            title: "Official Website",
            description: "Stay up to date with our latest news and features by visiting our official website!\n\n**Link:** [kozzyx.org](https://kozzyx.org)",
            footerUser: interaction.user,
            client: interaction.client,
            components: [row]
        }));
    },
};