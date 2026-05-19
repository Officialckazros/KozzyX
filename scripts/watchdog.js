#!/usr/bin/env node
import { sendEmail } from "../src/utils/email.js";

const STATS_URL = process.env.WATCHDOG_URL || 'http://localhost:3456/api/stats';
const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 60000);
const FAIL_THRESHOLD = Number(process.env.WATCHDOG_FAIL_THRESHOLD || 2);

let consecutiveFails = 0;

async function check() {
    try {
        const res = await fetch(STATS_URL, { method: 'GET' });
        if (!res.ok) {
            consecutiveFails++;
            console.error('[watchdog] Non-OK response', res.status);
        } else {
            const json = await res.json();
            if (!json || json.online !== true) {
                consecutiveFails++;
                console.error('[watchdog] Bot reported offline', json?.online);
            } else {
                if (consecutiveFails > 0) console.log('[watchdog] Bot recovered; resetting fail count.');
                consecutiveFails = 0;
                console.log('[watchdog] Bot online');
            }
        }
    } catch (e) {
        consecutiveFails++;
        console.error('[watchdog] Fetch error:', e.message || e);
    }

    if (consecutiveFails >= FAIL_THRESHOLD) {
        try {
            await sendEmail({ subject: `[Watchdog] Bot down`, text: `Watchdog detected bot down at ${new Date().toISOString()}\nURL: ${STATS_URL}\nConsecutive fails: ${consecutiveFails}` });
            console.log('[watchdog] Alert sent.');
        } catch (e) {
            console.error('[watchdog] Failed to send alert:', e);
        } finally {
            consecutiveFails = 0;
        }
    }
}

console.log(`[watchdog] Monitoring ${STATS_URL} every ${INTERVAL_MS}ms (threshold ${FAIL_THRESHOLD})`);
await check();
setInterval(check, INTERVAL_MS);
