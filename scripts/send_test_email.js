#!/usr/bin/env node
import 'dotenv/config';
import { sendEmail } from '../src/utils/email.js';

async function main() {
    const to = process.env.OWNER_EMAIL || 'ckazros@kozzyx.org';
    console.log('[email-test] Sending test email to', to);
    try {
        await sendEmail({
            to,
            subject: '[KozzyxBot] Test Email',
            text: `This is a test email from KozzyxBot at ${new Date().toISOString()}`
        });
        console.log('[email-test] Sent successfully');
    } catch (err) {
        console.error('[email-test] Error sending test email:', err);
        process.exitCode = 2;
    }
}

main();
