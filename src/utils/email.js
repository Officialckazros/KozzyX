import nodemailer from "nodemailer";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "ckazros@kozzyx.org";

function parseBool(v) {
    return v === 'true' || v === '1' || v === true;
}

function createTransporter(options = {}) {
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error('SMTP_HOST not configured');

    const port = Number(process.env.SMTP_PORT || 587);
    let secure;
    if (options.secure !== undefined) secure = !!options.secure;
    else if (process.env.SMTP_SECURE !== undefined) secure = parseBool(process.env.SMTP_SECURE);
    else secure = (port === 465);

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const auth = user && pass ? { user, pass } : undefined;

    const transportOptions = { host, port, secure };
    if (auth) transportOptions.auth = auth;

    if (process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false') {
        transportOptions.tls = { rejectUnauthorized: false };
    }

    return nodemailer.createTransport(transportOptions);
}

export async function sendEmail({ to = OWNER_EMAIL, subject, text, html }) {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || `bot@${process.env.SMTP_DOMAIN || 'kozzyx.org'}`;
    let transporter = createTransporter();
    try {
        const info = await transporter.sendMail({ from, to, subject, text, html });
        console.log('[email] Sent:', info.messageId);
        return info;
    } catch (err) {
        console.error('[email] sendEmail error:', err);
        const msg = String(err && (err.message || err));
        const shouldRetry = err && (err.code === 'ESOCKET' || err.code === 'ECONNECTION' || msg.toLowerCase().includes('wrong version number') || msg.toLowerCase().includes('tls'));
        if (shouldRetry) {
            try {
                const currentSecure = process.env.SMTP_SECURE !== undefined ? parseBool(process.env.SMTP_SECURE) : (Number(process.env.SMTP_PORT || 587) === 465);
                console.log('[email] Retrying with secure=', !currentSecure);
                transporter = createTransporter({ secure: !currentSecure });
                const info2 = await transporter.sendMail({ from, to, subject, text, html });
                console.log('[email] Sent (retry):', info2.messageId);
                return info2;
            } catch (err2) {
                console.error('[email] Retry failed:', err2);
                throw err2;
            }
        }
        throw err;
    }
}

export async function sendBotOfflineAlert(reason = 'offline', details = '') {
    const subject = `[KozzyxBot] Offline — ${reason}`;
    const text = `KozzyxBot reported offline at ${new Date().toISOString()}\n\nReason: ${reason}\n\nDetails:\n${details || '(none)'}\n\nProcess: ${process.pid}`;
    try {
        await sendEmail({ subject, text });
        console.log('[email] Offline alert sent to', OWNER_EMAIL);
    } catch (err) {
        console.error('[email] Failed to send offline alert:', err);
    }
}
