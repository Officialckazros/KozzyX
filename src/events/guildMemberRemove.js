import { Events } from "discord.js";
import { recordEvent } from "../dashboard-api.js";
import { getGuildSettings } from "../utils/database.js";

export default {
    name: Events.GuildMemberRemove,
    async execute(member) {
        try {
            recordEvent("leave", `${member.user?.username || "A member"} left the server`, member.guild?.id);
        } catch { /* feed is best-effort */ }

        // Goodbye Announcement
        try {
            const s = getGuildSettings(member.guild.id);
            if (s.goodbye?.enabled && s.goodbye?.channelId) {
                const channel = member.guild.channels.cache.get(s.goodbye.channelId);
                if (channel?.isTextBased()) {
                    const msg = (s.goodbye.message || "{user} left the server.")
                        .replace(/{user}/g, `<@${member.id}>`)
                        .replace(/{username}/g, member.user.username)
                        .replace(/{server}/g, member.guild.name);
                    await channel.send({ content: msg });
                }
            }
        } catch (err) {
            console.error("[goodbye] Send failed:", err);
        }
    }
};
