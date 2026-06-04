import { Events } from "discord.js";

export default {
    name: Events.GuildCreate,
    async execute(guild, client) {
        console.log(`Joined new guild: ${guild.name} (${guild.id}). Global slash commands are available.`);
    }
};
