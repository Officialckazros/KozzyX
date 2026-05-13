import { Events } from "discord.js";

export default {
    name: Events.GuildCreate,
    async execute(guild, client) {
        try {
            if (!client.user) return;
            if (!client.readyAt) return; // Ignore initial guild cache loading on startup

            await client.deploySlashCommands(guild.id);
            console.log(`✅ Instant deployed slash commands to ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error("GuildCreate deploy error:", err);
        }
    }
};
