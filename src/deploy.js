import { REST, Routes } from "discord.js";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const commands = [];

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

const slashFiles = getAllFiles(join(__dirname, "slashCommands"));

for (const file of slashFiles) {
    const command = await import(pathToFileURL(file).href);
    if (command.default?.data) {
        commands.push(command.default.data);
    }
}

const rest = new REST({ version: "10" }).setToken(token);

const normalized = commands.map(({ dm_permission, ...rest }) => ({
    ...rest,
    integration_types: [0],
    contexts: [0],
}));

try {
    console.log(`Started refreshing ${normalized.length} application (/) commands.`);

    await rest.put(
        Routes.applicationCommands(clientId),
        { body: normalized },
    );

    console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
    process.exit(0);
} catch (error) {
    console.error(error);
    process.exit(1);
}
