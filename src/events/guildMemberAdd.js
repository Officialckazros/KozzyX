import { Events } from "discord.js";
import { checkRaid } from "../utils/raidProtection.js";
import { recordEvent } from "../dashboard-api.js";
import { getGuildSettings } from "../utils/database.js";

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            recordEvent("join", `${member.user?.username || "A new member"} joined the server`, member.guild?.id);
        } catch {  }

        try {
            const s = getGuildSettings(member.guild.id);
            if (s.welcome?.enabled && s.welcome?.channelId) {
                const channel = member.guild.channels.cache.get(s.welcome.channelId);
                if (channel?.isTextBased()) {
                    const msg = (s.welcome.message || "Welcome {user} to the server!")
                        .replace(/{user}/g, `<@${member.id}>`)
                        .replace(/{username}/g, member.user.username)
                        .replace(/{server}/g, member.guild.name);
                    await channel.send({ content: msg });
                }
            }
        } catch (err) {
            console.error("[welcome] Send failed:", err);
        }

        try {
            await checkRaid(member);
        } catch (err) {
            console.error("[mod-bot] GuildMemberAdd error:", err);
        }
    }
};
