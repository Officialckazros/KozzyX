import { Events } from "discord.js";

export default {
    name: Events.GuildCreate,
    async execute(guild, client) {
        // Global commands are already deployed and available automatically in all guilds.
        // Deploying guild commands here would cause duplicate commands.
        console.log(`Joined new guild: ${guild.name} (${guild.id}). Global slash commands are available.`);
    }
};
