// ---------------- UTIL: SAFE INTERACTION REPLY ----------------
// MessageFlags.Ephemeral = 1 << 6 = 64. Use literal to avoid adding an import.
const EPHEMERAL_FLAG = 64;

// Convert deprecated { ephemeral: true } -> { flags: 64 } and strip editReply-incompatible keys when needed.
function normalizePayload(payload, { stripEphemeral = false } = {}) {
    if (!payload || typeof payload !== "object") return payload;
    const out = { ...payload };
    if (out.ephemeral) {
        if (!stripEphemeral) {
            out.flags = (out.flags || 0) | EPHEMERAL_FLAG;
        }
        delete out.ephemeral;
    } else if (out.ephemeral === false) {
        delete out.ephemeral;
    }
    return out;
}

// Discord API error codes we should silently swallow
// 10008 = Unknown Message, 10062 = Unknown Interaction, 40060 = Already acknowledged
const SILENT_ERRORS = new Set([10008, 10062, 40060]);

export async function safeRespond(interaction, payload) {
    // Force ephemeral if error for User Apps (usually safer)
    if (payload?.type === "error" && payload.ephemeral === undefined) {
        payload.ephemeral = true;
    }

    try {
        if (interaction.replied || interaction.deferred) {
            // editReply does NOT accept ephemeral/flags — strip them.
            return await interaction.editReply(normalizePayload(payload, { stripEphemeral: true }));
        }
        return await interaction.reply(normalizePayload(payload));
    } catch (e) {
        // Silently ignore expected, non-actionable Discord errors
        if (SILENT_ERRORS.has(e?.code)) return;

        // Only attempt a followUp if the interaction was actually acknowledged.
        // Otherwise followUp will throw InteractionNotReplied and spam logs.
        if (!(interaction.replied || interaction.deferred)) {
            console.error("[safeRespond] Reply failed (not acknowledged):", e?.message || e);
            return;
        }
        try {
            return await interaction.followUp(normalizePayload(payload));
        } catch (e2) {
            if (SILENT_ERRORS.has(e2?.code)) return;
            console.error("[safeRespond] FollowUp failed:", e2?.message || e2);
        }
    }
}
export async function safeUpdate(interaction, payload) {
    try {
        if (interaction.isButton && interaction.isButton()) {
            return await interaction.update(normalizePayload(payload, { stripEphemeral: true }));
        }
    } catch (e) {
        // 10062 = Unknown interaction (expired), 40060 = already acknowledged — both unrecoverable for .update()
        if (e?.code === 10062 || e?.code === 40060) return;
        try { return await safeRespond(interaction, payload); } catch { }
    }
}

// ---------------- TIME PARSER ----------------
export function parseDurationToMs(input) {
    if (!input) return null;
    const s = String(input).trim().toLowerCase();
    if (s === "off") return 0;
    const m = s.match(/^(\d+)(s|m|h|d)$/i);
    if (!m) return null;
    const value = parseInt(m[1], 10);
    if (Number.isNaN(value) || value <= 0) return null;
    const unit = m[2].toLowerCase();
    if (unit === "s") return value * 1000;
    if (unit === "m") return value * 60 * 1000;
    if (unit === "h") return value * 60 * 60 * 1000;
    if (unit === "d") return value * 24 * 60 * 60 * 1000;
    return null;
}

// ---------------- COLOR PARSER ----------------
export function parseHexColorToInt(hex) {
    if (!hex) return null;
    const cleaned = String(hex).trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
    return parseInt(cleaned, 16);
}

// ---------------- AUTORESPONDER MATCHING ----------------
export function matchesTrigger(messageLower, triggerLower) {
    if (!triggerLower) return false;
    if (triggerLower.includes(" ")) return messageLower.includes(triggerLower);
    const escaped = triggerLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(messageLower);
}

export function looksSpammy(text) {
    if (!text) return false;
    const mentionCount = (text.match(/<@/g) || []).length;
    if (mentionCount >= 5) return true;
    if (/(.)\1{9,}/.test(text)) return true;
    const links = (text.match(/https?:\/\/\S+/gi) || []).length;
    if (links >= 3) return true;
    if (text.split(/\s+/).some((w) => w.length >= 60)) return true;
    return false;
}

const DEFAULT_BAD_WORDS = [];
export function containsBadWords(textLower, list = DEFAULT_BAD_WORDS) {
    if (!list.length) return false;
    return list.some((w) => w && textLower.includes(String(w).toLowerCase()));
}

export function isEmojiResponse(str) {
    if (!str) return false;
    const trimmed = str.trim();
    if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(trimmed)) return true;
    if (!/\s/.test(trimmed)) {
        const codePoints = Array.from(trimmed);
        if (codePoints.length === 1) return true;
    }
    return false;
}

