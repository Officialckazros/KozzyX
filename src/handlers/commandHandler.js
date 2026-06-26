import { readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { normalizeCommandMeta } from "../utils/commandMeta.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = readdirSync(dirPath);

    files.forEach(function (file) {
        const fullPath = join(dirPath, file);
        if (statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (file.endsWith(".js")) arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

export default async function (client, { silent = false } = {}) {
    if (!silent) console.log("[CommandHandler] Starting to load commands...");

    client.slashCommands.clear();
    client.prefixCommands.clear();
    client.aliases.clear();
    client.slashData = [];

    const slashPath = join(__dirname, "../slashCommands");
    const prefixPath = join(__dirname, "../prefixCommands");

    const slashFiles = getAllFiles(slashPath);
    if (!silent) console.log(`[CommandHandler] Found ${slashFiles.length} slash command files.`);

    for (const file of slashFiles) {
        try {
            const cmd = await import(pathToFileURL(file).href);
            const command = cmd.default;
            if (command?.data?.name) {
                if (client.slashCommands.has(command.data.name)) {
                    console.error(`[CommandHandler] Duplicate slash command '${command.data.name}' in ${file}`);
                    continue;
                }
                normalizeCommandMeta({
                    command,
                    kind: "slash",
                    relativePath: relative(slashPath, file),
                });
                client.slashCommands.set(command.data.name, command);
                client.slashData.push(command.data);
                if (!silent) console.log(`[CommandHandler] Loaded Slash: ${command.data.name}`);
            } else {
                if (!silent) console.warn(`[CommandHandler] Skipped ${file} - Missing data.name`);
            }
        } catch (e) {
            console.error(`[CommandHandler] Error loading slash command ${file}:`, e);
        }
    }

    if (!silent) {
        console.log(`[CommandHandler] Total Slash Commands Loaded: ${client.slashCommands.size}`);
        console.log(`[CommandHandler] Keys: ${[...client.slashCommands.keys()].join(", ")}`);
    }

    const prefixFiles = getAllFiles(prefixPath);
    for (const file of prefixFiles) {
        try {
            const cmd = await import(pathToFileURL(file).href);
            const command = cmd.default;
            if (command?.name) {
                if (client.prefixCommands.has(command.name)) {
                    console.error(`[CommandHandler] Duplicate prefix command '${command.name}' in ${file}`);
                    continue;
                }
                normalizeCommandMeta({
                    command,
                    kind: "prefix",
                    relativePath: relative(prefixPath, file),
                });
                client.prefixCommands.set(command.name, command);
                if (command.aliases && Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        if (client.aliases.has(alias) || client.prefixCommands.has(alias)) {
                            console.error(`[CommandHandler] Duplicate prefix alias '${alias}' in ${file}`);
                            continue;
                        }
                        client.aliases.set(alias, command.name);
                    }
                }
            }
        } catch (e) {
            console.error(`[CommandHandler] Error loading prefix command ${file}:`, e);
        }
    }
}
