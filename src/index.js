import { ExtendedClient } from "./structures/Client.js";
import { initDB } from "./utils/db.js";

import interactionCreate from "./events/interactionCreate.js";
import messageCreate from "./events/messageCreate.js";
import ready from "./events/ready.js";
import guildMemberAdd from "./events/guildMemberAdd.js";
import guildMemberUpdate from "./events/guildMemberUpdate.js";
import guildAuditLogEntryCreate from "./events/guildAuditLogEntryCreate.js";
import guildCreate from "./events/guildCreate.js";
import voiceStateUpdate from "./events/voiceStateUpdate.js";
import loadCommands from "./handlers/commandHandler.js";
import { initAPI } from "./dashboard-api.js";
import { sendBotOfflineAlert } from "./utils/email.js";

const client = new ExtendedClient();

async function init() {
    console.log("-----------------------------------------");
    console.log("[bot] BEGINNING INITIALIZATION");
    console.log("-----------------------------------------");

    await initDB();
    await loadCommands(client);
    initAPI(client);

    client.on(interactionCreate.name,        (...args) => interactionCreate.execute(...args, client));
    client.on(messageCreate.name,            (...args) => messageCreate.execute(...args, client));
    client.on(guildMemberAdd.name,           (...args) => guildMemberAdd.execute(...args, client));
    client.on(guildMemberUpdate.name,        (...args) => guildMemberUpdate.execute(...args, client));
    client.on(guildAuditLogEntryCreate.name, (...args) => guildAuditLogEntryCreate.execute(...args, client));
    client.on(guildCreate.name,              (...args) => guildCreate.execute(...args, client));
    client.on(voiceStateUpdate.name,         (...args) => voiceStateUpdate.execute(...args, client));
    client.once(ready.name,                  (...args) => ready.execute(...args, client));

    // Email alerts for disconnects / errors
    client.on('shardDisconnect', (event, shardId) => {
        console.error('[bot] shardDisconnect', shardId, event);
        sendBotOfflineAlert('shardDisconnect', `Shard ${shardId} disconnected: ${JSON.stringify(event)}`).catch(console.error);
    });
    client.on('shardError', (error, shardId) => {
        console.error('[bot] shardError', shardId, error);
        sendBotOfflineAlert('shardError', String(error)).catch(console.error);
    });
    client.on('error', (err) => {
        console.error('[bot] client error', err);
        sendBotOfflineAlert('clientError', String(err)).catch(console.error);
    });

    console.log("[bot] Logging in...");
    client.login(process.env.TOKEN);
}

init();

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    sendBotOfflineAlert('unhandledRejection', String(err)).catch(console.error);
});
process.on("uncaughtException",  (err) => {
    console.error("Uncaught Exception:",  err);
    sendBotOfflineAlert('uncaughtException', String(err)).catch(console.error);
});

process.on('SIGINT', () => {
    console.log('[bot] SIGINT received, sending shutdown alert.');
    sendBotOfflineAlert('SIGINT', 'Process interrupted (SIGINT)').finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
    console.log('[bot] SIGTERM received, sending shutdown alert.');
    sendBotOfflineAlert('SIGTERM', 'Process terminated (SIGTERM)').finally(() => process.exit(0));
});
