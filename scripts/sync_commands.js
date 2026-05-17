import fs from 'fs';
import path from 'path';

const BOT_ROOT = './src';
const WEB_ROOT = '.';
const HTML_FILES = ['website/index.html', 'website/kozzyxbotmain.html'];

const DIR_TO_CAT = {
    'general': 'utility',
    'fun': 'fun'
};

function extractCommands() {
    const commands = [];
    const slashRoot = path.join(BOT_ROOT, 'slashCommands');
    
    if (!fs.existsSync(slashRoot)) return commands;

    const categories = fs.readdirSync(slashRoot);
    
    for (const category of categories) {
        const catPath = path.join(slashRoot, category);
        if (!fs.statSync(catPath).isDirectory()) continue;
        
        const catLabel = DIR_TO_CAT[category] || 'utility';
        
        const files = fs.readdirSync(catPath);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const content = fs.readFileSync(path.join(catPath, file), 'utf8');
                const nameMatch = content.match(/name:\s*"([^"]+)"/);
                const descMatch = content.match(/description:\s*"([^"]+)"/);
                
                if (nameMatch && descMatch) {
                    commands.push({
                        cmd: `/${nameMatch[1]}`,
                        args: "",
                        desc: descMatch[1],
                        cat: catLabel,
                        popular: false
                    });
                }
            }
        }
    }
    return commands;
}

function updateHtmlFiles(commands) {
    let jsArray = "const COMMANDS = " + JSON.stringify(commands, null, 12) + ";";
    jsArray = jsArray.replace('const COMMANDS = [', 'const COMMANDS = [\n            // Automatically Synced Commands');
    
    const markerBegin = '/*COMMANDS-DATA-BEGIN*/';
    const markerEnd = '/*COMMANDS-DATA-END*/';
    
    for (const filename of HTML_FILES) {
        const filepath = path.join(WEB_ROOT, filename);
        if (!fs.existsSync(filepath)) continue;
        
        const content = fs.readFileSync(filepath, 'utf8');
        const startIdx = content.indexOf(markerBegin);
        const endIdx = content.indexOf(markerEnd);
        
        if (startIdx === -1 || endIdx === -1) {
            console.log(`Markers not found in ${filename}`);
            continue;
        }
        
        const newContent = content.substring(0, startIdx + markerBegin.length) +
            `\n        ${jsArray}\n        ` +
            content.substring(endIdx);
            
        fs.writeFileSync(filepath, newContent);
        console.log(`Updated ${filename}`);
    }
}

const cmds = extractCommands();
if (cmds.length > 0) {
    updateHtmlFiles(cmds);
    console.log(`Successfully synced ${cmds.length} commands.`);
} else {
    console.log("No commands found to sync.");
}
