import { Events } from "discord.js";
import { replyEmbed } from "../utils/embeds.js";
import { checkMassMention } from "../utils/raidProtection.js";
import { isCommandEnabled, checkCooldown, recordCommandRun } from "../dashboard-api.js";
import { GLOBALLY_BLOCKED_IDS } from "../utils/constants.js";

const MOD_PREFIX = ",";
const CONFIG_PREFIX = "!";

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        try {
            if (!message?.content || message.author.bot) return;
            if (GLOBALLY_BLOCKED_IDS.has(message.author.id)) return;
            if (!message.guild) return;

            const blocked = await checkMassMention(message);
            if (blocked) return;

            const raw = message.content;
            const isConfig = raw.startsWith(CONFIG_PREFIX);
            const isMod = raw.startsWith(MOD_PREFIX);
            if (!isConfig && !isMod) return;

            const prefix = isConfig ? CONFIG_PREFIX : MOD_PREFIX;
            const args = raw.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift()?.toLowerCase();
            if (!commandName) return;

            const command = client.prefixCommands.get(commandName)
                || client.prefixCommands.get(client.aliases.get(commandName));

            if (!command) return;

            if (isConfig && !command.config) return;
            if (isMod && command.config) return;

            if (!isCommandEnabled("prefix", command.name)) {
                return replyEmbed(message, {
                    type: "error",
                    title: "Command Disabled",
                    description: `The \`${command.name}\` command is currently disabled from the dashboard.`,
                });
            }

            const cd = checkCooldown("prefix", command.name, message.author.id);
            if (!cd.ok) {
                return replyEmbed(message, {
                    type: "warning",
                    title: "Slow Down",
                    description: `Wait **${cd.remaining}s** before using \`${command.name}\` again.`,
                });
            }

            try {
                await command.execute(message, args, client);
                recordCommandRun({ name: command.name, type: "prefix", user: message.author.username, guildId: message.guild.id });
            } catch (error) {
                console.error("[messageCreate] Command execution error:", error);
                await replyEmbed(message, {
                    type: "error",
                    title: "Something went wrong",
                    description: "There was an error while executing this command!",
                });
            }
        } catch (err) {
            console.error("[messageCreate] Error:", err);
        }
    }
};
