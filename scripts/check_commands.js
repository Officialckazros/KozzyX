import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";
import { normalizeCommandMeta } from "../src/utils/commandMeta.js";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22) {
    console.error(`This project is validated on Node 22 LTS. Current runtime is ${process.version}.`);
    console.error("Use Node 22 before running npm install, npm run check, or starting the bot.");
    process.exit(1);
}

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = readdirSync(dirPath);
    for (const file of files) {
        const fullPath = join(dirPath, file);
        if (statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith(".js")) {
            arrayOfFiles.push(fullPath);
        }
    }
    return arrayOfFiles;
}

function checkSyntax(files) {
    let failed = false;
    for (const file of files) {
        const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
        if (result.status !== 0) {
            failed = true;
            console.error(result.stderr || result.stdout);
        }
    }
    return !failed;
}

async function checkCommands() {
    const slashRoot = "src/slashCommands";
    const prefixRoot = "src/prefixCommands";
    const slashFiles = getAllFiles(slashRoot);
    const prefixFiles = getAllFiles(prefixRoot);

    const slashNames = new Set();
    const prefixNames = new Set();
    const aliases = new Set();
    let failed = false;

    for (const file of slashFiles) {
        try {
            const mod = await import(pathToFileURL(join(process.cwd(), file)).href);
            const command = mod.default;
            if (!command?.data?.name || !command?.data?.description || typeof command.execute !== "function") {
                console.error(`Invalid slash command export: ${file}`);
                failed = true;
                continue;
            }
            if (slashNames.has(command.data.name)) {
                console.error(`Duplicate slash command: ${command.data.name}`);
                failed = true;
            }
            slashNames.add(command.data.name);
            normalizeCommandMeta({ command, kind: "slash", relativePath: relative(slashRoot, file) });
            command.data.toJSON?.();
        } catch (err) {
            failed = true;
            console.error(`Failed to validate slash command ${file}: ${err.stack || err.message}`);
        }
    }

    for (const file of prefixFiles) {
        try {
            const mod = await import(pathToFileURL(join(process.cwd(), file)).href);
            const command = mod.default;
            if (!command?.name || typeof command.execute !== "function") {
                console.error(`Invalid prefix command export: ${file}`);
                failed = true;
                continue;
            }
            if (prefixNames.has(command.name)) {
                console.error(`Duplicate prefix command: ${command.name}`);
                failed = true;
            }
            prefixNames.add(command.name);
            normalizeCommandMeta({ command, kind: "prefix", relativePath: relative(prefixRoot, file) });
            for (const alias of command.aliases || []) {
                if (aliases.has(alias) || prefixNames.has(alias)) {
                    console.error(`Duplicate prefix alias: ${alias}`);
                    failed = true;
                }
                aliases.add(alias);
            }
        } catch (err) {
            failed = true;
            console.error(`Failed to validate prefix command ${file}: ${err.stack || err.message}`);
        }
    }

    if (failed) process.exit(1);
    console.log(`Validated ${slashNames.size} slash command(s), ${prefixNames.size} prefix command(s), and ${aliases.size} alias(es).`);
}

const allSourceFiles = getAllFiles("src").concat(getAllFiles("scripts"));
if (!checkSyntax(allSourceFiles)) process.exit(1);
await checkCommands();
