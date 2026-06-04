import { AttachmentBuilder } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { buildCoolEmbed } from "../../utils/embeds.js";

const MODELS = [
    { name: "Nano Banana 2 (default)", value: "nano-banana-2" },
];

async function generateImageWithNanoBanana(prompt, width, height) {
    if (!process.env.NANO_BANANA_API_KEY) {
        throw new Error("Missing NANO_BANANA_API_KEY in .env");
    }

    const payload = {
        model_name: "nano-banana-2",
        prompt: prompt,
        width: width,
        height: height,
        steps: 50,
    };

    const response = await fetch("https://api.banana.dev/v1/start/inference", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NANO_BANANA_API_KEY}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Nano Banana API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    if (!data.image_url) {
        throw new Error("No image URL returned from Nano Banana API");
    }

    const imageRes = await fetch(data.image_url);
    if (!imageRes.ok) {
        throw new Error(`Failed to fetch generated image: ${imageRes.status}`);
    }

    return {
        buffer: Buffer.from(await imageRes.arrayBuffer()),
    };
}

export default {
    data: {
        name: "imagine",
        description: "Generate an image using Nano Banana 2 AI",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            { name: "prompt", description: "Image description", type: 3, required: true },
            { name: "width", description: "Width (default 1024)", type: 4, required: false, min_value: 256, max_value: 2048 },
            { name: "height", description: "Height (default 1024)", type: 4, required: false, min_value: 256, max_value: 2048 },
        ],
    },

    async execute(i) {
        const prompt = i.options.getString("prompt");
        const width = i.options.getInteger("width") ?? 1024;
        const height = i.options.getInteger("height") ?? 1024;

        await i.deferReply();

        try {
            const { buffer } = await generateImageWithNanoBanana(prompt, width, height);
            const attachment = new AttachmentBuilder(buffer, { name: "imagine.png" });

            const details = [`**Model:** Nano Banana 2`, `**Size:** ${width}x${height}`];

            const embed = buildCoolEmbed({
                guildId: i.guild?.id,
                type: "info",
                title: "Nano Banana 2 Generation",
                description: `**Prompt:** ${prompt}\n\n${details.join(" • ")}`,
                footerUser: i.user,
                client: i.client,
            }).setImage("attachment://imagine.png");

            return safeRespond(i, { embeds: [embed], files: [attachment] });
        } catch (err) {
            console.error("[imagine]", err);
            const embed = buildCoolEmbed({
                guildId: i.guild?.id,
                type: "error",
                title: "Nano Banana 2 Failed",
                description: `Could not generate image.\n\`${err.message}\``,
                footerUser: i.user,
                client: i.client,
            });
            return safeRespond(i, { embeds: [embed] });
        }
    },
};
