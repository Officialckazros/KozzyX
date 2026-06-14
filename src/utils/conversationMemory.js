// Ephemeral, in-memory conversation memory for /ask.
//
// Privacy by design: conversation content is NEVER written to disk. It lives
// only in this process's memory, is capped per user, and auto-expires after a
// short idle window. Restarting the bot wipes everything. There is no log file,
// database row, or dashboard endpoint that exposes this data — not even to the
// bot owner.

const TTL_MS = 30 * 60 * 1000; // forget a conversation after 30 min of inactivity
const SWEEP_MS = 5 * 60 * 1000; // prune expired entries every 5 min

// key: `${userId}:${guildId}` -> { messages: [...], expires: number }
const store = new Map();

function keyFor(userId, guildId) {
    return `${userId}:${guildId}`;
}

export function getConversation(userId, guildId) {
    const entry = store.get(keyFor(userId, guildId));
    if (!entry) return [];
    if (entry.expires <= Date.now()) {
        store.delete(keyFor(userId, guildId));
        return [];
    }
    // Return a copy so callers can't mutate stored state directly.
    return entry.messages.map(m => ({ ...m }));
}

export function setConversation(userId, guildId, messages) {
    store.set(keyFor(userId, guildId), {
        messages: messages.map(m => ({ ...m })),
        expires: Date.now() + TTL_MS,
    });
}

export function clearConversation(userId, guildId) {
    return store.delete(keyFor(userId, guildId));
}

// Background pruning so abandoned conversations don't linger in memory.
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of store) {
        if (entry.expires <= now) store.delete(k);
    }
}, SWEEP_MS);
// Don't keep the event loop alive just for the sweeper.
if (typeof sweeper.unref === "function") sweeper.unref();
