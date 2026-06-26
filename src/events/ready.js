import { Events } from "discord.js";
import {
    loadSettings,
    loadWarnings,
    loadAutoresponders,
    loadBoosterRoles,
    loadAfk,
    loadCosmetics
} from "../utils/database.js";

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}`);
        await loadSettings();
        await loadWarnings();
        await loadAutoresponders();
        await loadBoosterRoles();
        await loadAfk();
        await loadCosmetics();

        if (process.env.DEPLOY_SLASH_ON_READY === "true") {
            const guildId = process.env.DEPLOY_SLASH_GUILD_ID || null;
            await client.deploySlashCommands(guildId);
        } else {
            console.log("Slash command auto-deploy skipped. Run npm run deploy or set DEPLOY_SLASH_ON_READY=true.");
        }

        console.log("Bot systems fully loaded & online.");
    }
};
