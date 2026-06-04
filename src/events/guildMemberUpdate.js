import { Events } from "discord.js";
import { getGuildSettings } from "../utils/database.js";

export default {
    name: Events.GuildMemberUpdate,
    async execute(oldM, newM) {
        try {
            const settings = getGuildSettings(newM.guild.id);

            if (settings.nickLocks && settings.nickLocks[newM.id]) {
                const lock = settings.nickLocks[newM.id];
                if (oldM.nickname !== newM.nickname) {
                    try { await newM.setNickname(lock, "Nickname locked"); } catch { }
                }
            }

            if (settings.boosterWelcomeBonus?.enabled && !oldM.premiumSince && newM.premiumSince) {
                const roleName = settings.boosterWelcomeBonus.title || "Server Booster";
                let role = newM.guild.roles.cache.find(r => r.name === roleName);
                if (!role) {
                    try {
                        role = await newM.guild.roles.create({
                            name: roleName,
                            color: "#f47fff",
                            reason: "Booster Welcome Perk custom title"
                        });
                    } catch (e) { }
                }
                if (role) {
                    try {
                        await newM.roles.add(role, "Granted Booster Welcome custom role");
                    } catch (e) { }
                }
            }
        } catch { }
    }
};
