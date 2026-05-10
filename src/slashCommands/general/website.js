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
                    .setURL("https://kozzyx.bazsi9849.workers.dev/")
                    .setStyle(ButtonStyle.Link)
            );

        return safeRespond(interaction, asEmbedPayload({
            guildId: interaction.guildId,
            type: "info",
            title: "🌐 Official Website",
            description: "Stay up to date with our latest news and features by visiting our official website!\n\n**Link:** [kozzyx.bazsi9849.workers.dev](https://kozzyx.bazsi9849.workers.dev/)",
            footerUser: interaction.user,
            client: interaction.client,
            components: [row]
        }));
    },
};
