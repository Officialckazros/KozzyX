

const TTL_MS = 30 * 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;

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

const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of store) {
        if (entry.expires <= now) store.delete(k);
    }
}, SWEEP_MS);

if (typeof sweeper.unref === "function") sweeper.unref();
