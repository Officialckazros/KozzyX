#!/usr/bin/env node
import 'dotenv/config';

(async () => {
  const t = process.env.TOKEN;
  if (!t) {
    console.error('NO_TOKEN');
    process.exit(2);
  }
  try {
    const r = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bot ${t}` } });
    const j = await r.json();
    console.log(JSON.stringify({ ok: r.ok, status: r.status, user: { id: j.id, username: j.username, discriminator: j.discriminator } }));
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
