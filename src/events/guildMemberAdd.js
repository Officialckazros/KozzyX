import { Events } from "discord.js";
import { checkRaid } from "../utils/raidProtection.js";
import { recordEvent } from "../dashboard-api.js";

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            recordEvent("join", `${member.user?.username || "A new member"} joined the server`, member.guild?.id);
        } catch { /* feed is best-effort */ }
        try {
            await checkRaid(member);
        } catch (err) {
            console.error("[mod-bot] GuildMemberAdd error:", err);
        }
    }
};
