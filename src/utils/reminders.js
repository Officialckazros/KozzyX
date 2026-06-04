import { getDB } from "./db.js";
import { buildCoolEmbed } from "./embeds.js";

const MAX_TIMEOUT = 2147483647;

export async function addReminder(userId, content, remindAt, channelId) {
    const db = await getDB();
    const result = await db.run(
        "INSERT INTO reminders (user_id, content, remind_at, channel_id) VALUES (?, ?, ?, ?)",
        userId, content, remindAt, channelId
    );
    return result.lastID;
}

export async function removeReminder(id) {
    const db = await getDB();
    await db.run("DELETE FROM reminders WHERE id = ?", id);
}

export async function initReminders(client) {
    const db = await getDB();
    const reminders = await db.all("SELECT * FROM reminders");
    const now = Date.now();

    for (const r of reminders) {
        if (r.remind_at <= now) {
            await sendReminder(client, r, true);
        } else {
            scheduleReminder(client, r);
        }
    }
    console.log(`⏰ Loaded ${reminders.length} reminders.`);

    setInterval(async () => {
        try {
            const db2 = await getDB();
            const due = await db2.all("SELECT * FROM reminders WHERE remind_at <= ?", Date.now());
            for (const r of due) await sendReminder(client, r);
        } catch (err) {
            console.error("[reminders] Sweep error:", err);
        }
    }, 60_000);
}

export function scheduleReminder(client, reminder) {
    const diff = reminder.remind_at - Date.now();

    if (diff <= 0) {
        sendReminder(client, reminder);
        return;
    }

    if (diff > MAX_TIMEOUT) {
        setTimeout(() => scheduleReminder(client, reminder), MAX_TIMEOUT);
        return;
    }

    setTimeout(() => sendReminder(client, reminder), diff);
}

async function sendReminder(client, reminder, late = false) {
    try {
        await removeReminder(reminder.id);

        let target;
        try {
            if (reminder.channel_id) {
                target = await client.channels.fetch(reminder.channel_id).catch(() => null);
            }
            if (!target) {
                const user = await client.users.fetch(reminder.user_id).catch(() => null);
                target = user;
            }
        } catch (err) {
            console.error("[reminders] Failed to fetch delivery target:", err);
        }

        if (!target) return;

        const embed = buildCoolEmbed({
            type: late ? "warning" : "info",
            title: "⏰ Reminder",
            description: late ? `(Sorry I'm late!)\n\n${reminder.content}` : reminder.content,
            footerText: "Stored with SQLite",
        });

        await target.send({ content: `<@${reminder.user_id}>`, embeds: [embed] });

    } catch (err) {
        console.error("Failed to send reminder:", err);
    }
}
