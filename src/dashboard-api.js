import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';
import crypto from 'crypto';
import { GLOBALLY_BLOCKED_IDS, GLOBALLY_BLOCKED_EMAILS } from './utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseModuleUrl = new URL('./utils/database.js', import.meta.url).href;
async function importDatabase() {
    return import(databaseModuleUrl);
}

const PORT = 3456;
const AUTH_KEY = 'KozzyX_Internal_API_' + crypto.randomBytes(32).toString('hex');
const REDIRECT_URI = process.env.DASHBOARD_REDIRECT_URI || 'https://kozzyx.org/dashboard';

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(name, fallback) {
    const p = path.join(DATA_DIR, name);
    try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { }
    return fallback;
}
function saveJSON(name, data) {
    const p = path.join(DATA_DIR, name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

let triggers = [];
let config = loadJSON('config.json', { prefix: ',' });
let modlogs = loadJSON('modlogs.json', []);
let tasks = loadJSON('tasks.json', []);
let commandOverrides = loadJSON('command_overrides.json', {});

let botLogs = [];
const MAX_LOGS = 200;
let botStats = {
    members: 0,
    commandsRan: 0,
    uptime: Date.now(),
    guilds: 0,
    shards: 1
};

const sessions = new Map();

let feedEvents = [];
const MAX_FEED = 120;
const cooldownHits = new Map();

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function addModLog(action, target, moderator, reason) {
    const log = {
        id: Date.now().toString(),
        action,
        target,
        moderator,
        reason: reason || 'No reason provided',
        time: new Date().toISOString()
    };
    modlogs.unshift(log);
    if (modlogs.length > 100) modlogs.pop();
    saveJSON('modlogs.json', modlogs);
}

function json(res, status, data) {
    if (res.writableEnded || res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

export function initAPI(client) {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-guild-id, Authorization, Origin, Accept');
        res.setHeader('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        if (pathname === '/dashboard.html' || pathname === '/dashboard' || pathname === '/') {
            const filePath = path.join(__dirname, '../website/dashboard.html');
            if (fs.existsSync(filePath)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fs.readFileSync(filePath));
                return;
            }
        }

        if (pathname === '/api/auth/login' && method === 'GET') {
            const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
            return json(res, 200, { url });
        }

        if (pathname === '/api/auth/callback' && method === 'POST') {
            try {
                const { code } = await readBody(req);
                const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                    method: 'POST',
                    body: new URLSearchParams({
                        client_id: process.env.CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        code,
                        grant_type: 'authorization_code',
                        redirect_uri: REDIRECT_URI,
                        scope: 'identify guilds',
                    }),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                });
                const tokens = await tokenResponse.json();
                if (!tokens.access_token) throw new Error(tokens.error_description || 'Failed to get access token');

                const userRes = await fetch('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${tokens.access_token}` }
                });
                const userData = await userRes.json();

                if (userData.id && GLOBALLY_BLOCKED_IDS.has(userData.id)) {
                    return json(res, 403, { error: 'Access forbidden: User is globally blocked' });
                }

                if (userData.email && GLOBALLY_BLOCKED_EMAILS.has(userData.email.toLowerCase())) {
                    return json(res, 403, { error: 'Access forbidden: Email is globally blocked' });
                }

                const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
                    headers: { Authorization: `Bearer ${tokens.access_token}` }
                });
                const userGuilds = await guildsRes.json();

                const isOwner = userData.id === process.env.OWNER_ID;
                const sessionToken = crypto.randomBytes(32).toString('hex');

                sessions.set(sessionToken, { ...userData, guilds: Array.isArray(userGuilds) ? userGuilds : [], isOwner });

                addLog('OK', `Login: ${userData.username}`);
                return json(res, 200, {
                    token: sessionToken,
                    user: { ...userData, isOwner }
                });
            } catch (err) {
                return json(res, 400, { error: err.message });
            }
        }

        const authHeader = req.headers['authorization'];
        const sessionToken = authHeader ? authHeader.split(' ')[1] : null;
        const apiKey = req.headers['x-api-key'];
        const isInternal = apiKey === AUTH_KEY;

        if (!sessions.has(sessionToken) && !isInternal) {
            return json(res, 401, { error: 'Unauthorized' });
        }

        const sessionUser = sessions.get(sessionToken) || { isOwner: isInternal, guilds: [], id: 'INTERNAL' };

        if (sessionUser.id && GLOBALLY_BLOCKED_IDS.has(sessionUser.id)) {
            return json(res, 403, { error: 'Access forbidden: User is globally blocked' });
        }

        if (sessionUser.email && GLOBALLY_BLOCKED_EMAILS.has(sessionUser.email.toLowerCase())) {
            return json(res, 403, { error: 'Access forbidden: Email is globally blocked' });
        }

        const guildId = req.headers['x-guild-id'] || process.env.GUILD_ID;
        const guild = client.guilds.cache.get(guildId);

        if (guildId && !sessionUser.isOwner && !pathname.startsWith('/api/auth/')) {
            const userGuilds = sessionUser.guilds || [];
            const ug = userGuilds.find(u => u.id === guildId);
            const hasAccess = ug && (ug.owner || (BigInt(ug.permissions) & 0x20n));
            if (!hasAccess) {
                return json(res, 403, { error: 'You do not have permission to manage this server.' });
            }
        }

        const executorId = sessionUser?.id || process.env.OWNER_ID;
        const executorMember = guild ? await guild.members.fetch(executorId).catch(() => null) : null;

        function canActOn(targetMember, reqPerm) {
            if (sessionUser.isOwner) return true;
            if (!executorMember) return false;
            if (reqPerm && !executorMember.permissions.has(reqPerm)) return false;
            if (targetMember && executorMember.id !== guild.ownerId && executorMember.roles.highest.position <= targetMember.roles.highest.position) return false;
            return true;
        }

        try {

            if (pathname === '/api/auth/guilds' && method === 'GET') {
                const userGuilds = sessionUser.guilds || [];
                const accessibleGuilds = client.guilds.cache.filter(g => {
                    if (sessionUser.isOwner) return true;
                    const ug = userGuilds.find(u => u.id === g.id);
                    if (!ug) return false;
                    return ug.owner || (BigInt(ug.permissions) & 0x20n);
                });
                return json(res, 200, accessibleGuilds.map(g => ({
                    id: g.id, name: g.name, icon: g.iconURL(), memberCount: g.memberCount
                })));
            }

            if (pathname === '/api/stats' && method === 'GET') {
                const mem = process.memoryUsage();
                const owner = guild ? await guild.fetchOwner().catch(() => null) : null;
                const textChannels = guild ? guild.channels.cache.filter(c => c.type === 0).size : 0;
                const voiceChannels = guild ? guild.channels.cache.filter(c => c.type === 2).size : 0;
                return json(res, 200, {
                    ...botStats,
                    uptime: Math.floor((Date.now() - botStats.uptime) / 1000),
                    members: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
                    guilds: client.guilds.cache.size,
                    online: client.ws.status === 0,
                    ping: client.ws.ping,
                    guildName: guild?.name || '',
                    guildId: guild?.id || '',
                    guildIcon: guild?.iconURL({ size: 128 }) || null,
                    guildMembers: guild?.memberCount || 0,
                    guildOnline: guild ? guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size : 0,
                    guildBots: guild ? guild.members.cache.filter(m => m.user.bot).size : 0,
                    guildChannels: guild?.channels.cache.size || 0,
                    guildTextChannels: textChannels,
                    guildVoiceChannels: voiceChannels,
                    guildRoles: guild?.roles.cache.size || 0,
                    guildEmojis: guild?.emojis.cache.size || 0,
                    guildCreated: guild?.createdTimestamp || null,
                    guildOwner: owner?.user?.tag || null,
                    guildBoostTier: guild?.premiumTier || 0,
                    guildBoostCount: guild?.premiumSubscriptionCount || 0,
                    guildVerification: guild ? String(guild.verificationLevel) : null,
                    sys: {
                        memory: Math.floor(mem.rss / 1024 / 1024),
                        cpu: process.cpuUsage().user / 1000000
                    }
                });
            }

            if (pathname === '/api/feed' && method === 'GET') {
                const list = feedEvents
                    .filter(e => !guildId || !e.guildId || e.guildId === guildId)
                    .slice(0, 40);
                return json(res, 200, list);
            }

            if (pathname === '/api/logs' && method === 'GET') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                return json(res, 200, botLogs);
            }

            if (pathname === '/api/message' && method === 'POST') {
                const { channelId, content } = await readBody(req);
                const channel = await client.channels.fetch(channelId);
                if (!channel) return json(res, 404, { error: 'Channel not found' });
                if (channel.guild.id !== guild.id) return json(res, 403, { error: 'Channel not in your guild' });
                await channel.send(content);
                addLog('OK', `Message sent to #${channel.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/broadcast' && method === 'POST') {
                if (!canActOn(null, 'ManageChannels') && !canActOn(null, 'Administrator')) return json(res, 403, { error: 'Missing Manage Channels permission' });
                const { content, isEmbed } = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                const channels = guild.channels.cache.filter(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages'));
                let sent = 0;
                for (const ch of channels.values()) {
                    try {
                        if (isEmbed) {
                            await ch.send({ embeds: [{ description: content, color: 0x9b87f5 }] });
                        } else {
                            await ch.send(content);
                        }
                        sent++;
                    } catch { }
                }
                addLog('OK', `Broadcast sent to ${sent} channels`);
                return json(res, 200, { success: true, sent });
            }

            if (pathname === '/api/terminal' && method === 'POST') {
                const { command: fullCommand, channelId } = await readBody(req);
                addLog('CMD', `> ${fullCommand}`);
                const prefix = fullCommand.startsWith(',') ? ',' : fullCommand.startsWith('!') ? '!' : null;
                if (!prefix) return json(res, 400, { error: 'Invalid prefix (use , or !)' });

                const args = fullCommand.slice(prefix.length).trim().split(/\s+/);
                const commandName = args.shift()?.toLowerCase();
                const command = client.prefixCommands.get(commandName)
                    || (client.aliases && client.prefixCommands.get(client.aliases.get(commandName)));
                if (!command) {
                    addLog('ERR', `Unknown command: ${commandName}`);
                    return json(res, 404, { error: `Unknown command: ${commandName}` });
                }

                if (!guild) return json(res, 404, { error: 'Guild not found' });
                const channel = channelId
                    ? guild.channels.cache.get(channelId)
                    : guild.channels.cache.find(c => c.type === 0);
                if (!channel) return json(res, 404, { error: 'No text channel available' });

                const executorId = sessionUser?.id || process.env.OWNER_ID;
                const member = await guild.members.fetch(executorId).catch(() => null);
                if (!member) return json(res, 500, { error: 'Could not resolve executing member' });

                const mentionedUsers = new Map();
                const mentionedMembers = new Map();
                for (const a of args) {
                    const m = a.match(/^<@!?(\d+)>$/);
                    if (m) {
                        const u = await client.users.fetch(m[1]).catch(() => null);
                        if (u) mentionedUsers.set(u.id, u);
                        const gm = await guild.members.fetch(m[1]).catch(() => null);
                        if (gm) mentionedMembers.set(gm.id, gm);
                    }
                }

                const responses = [];
                const captureContent = (content) => typeof content === 'string'
                    ? content
                    : content?.content || content?.embeds?.[0]?.description || content?.embeds?.[0]?.title || '[embed]';
                const realSend = channel.send.bind(channel);
                const wrappedChannel = new Proxy(channel, {
                    get(target, prop) {
                        if (prop === 'send') return async (content) => {
                            const text = captureContent(content);
                            responses.push(text);
                            addLog('OUT', text);
                            return realSend(content);
                        };
                        const v = target[prop];
                        return typeof v === 'function' ? v.bind(target) : v;
                    }
                });
                const mockMessage = {
                    content: fullCommand,
                    author: member?.user || { id: executorId, username: 'Dashboard User' },
                    member: member || {
                        id: executorId,
                        permissions: { has: (perm) => executorId === process.env.OWNER_ID || member?.permissions?.has(perm) }
                    },
                    guild,
                    channel: wrappedChannel,
                    client,
                    id: Date.now().toString(),
                    mentions: {
                        users: { first: () => Array.from(mentionedUsers.values())[0], size: mentionedUsers.size, values: () => mentionedUsers.values(), get: (id) => mentionedUsers.get(id) },
                        members: { first: () => Array.from(mentionedMembers.values())[0], size: mentionedMembers.size, values: () => mentionedMembers.values(), get: (id) => mentionedMembers.get(id) },
                        channels: { first: () => null, size: 0 },
                        roles: { first: () => null, size: 0 }
                    },
                    reply: async (content) => {
                        const text = captureContent(content);
                        responses.push(text);
                        addLog('OUT', text);
                        try { await realSend(typeof content === 'string' ? `↳ ${content}` : content); } catch { }
                        return { delete: async () => { }, edit: async () => { }, id: Date.now().toString() };
                    },
                    delete: async () => { },
                    edit: async () => { },
                    react: async () => { }
                };

                try {
                    await command.execute(mockMessage, args, client);
                    botStats.commandsRan++;
                    recordEvent('command', `${sessionUser?.username || 'Dashboard'} ran ${commandName} (dashboard)`, guild?.id);
                    return json(res, 200, { success: true, output: responses });
                } catch (err) {
                    addLog('ERR', `Command error: ${err.message}`);
                    return json(res, 500, { error: err.message, output: responses });
                }
            }

            if (pathname === '/api/members' && method === 'GET') {
                if (!guild) return json(res, 200, []);
                await guild.members.fetch().catch(() => { });
                const members = guild.members.cache.map(m => ({
                    id: m.id,
                    username: m.user.username,
                    tag: m.user.tag,
                    avatar: m.user.displayAvatarURL(),
                    bot: m.user.bot,
                    roles: m.roles.cache.filter(r => r.id !== guild.id).map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
                    joinedAt: m.joinedAt,
                    status: m.presence?.status || 'offline'
                }));
                return json(res, 200, members);
            }

            if (pathname === '/api/members/action' && method === 'POST') {
                const { userId, action, reason, duration } = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                const act = (action || '').toUpperCase();
                const moderator = sessionUser?.username || 'Dashboard';
                try {
                    const targetMember = await guild.members.fetch(userId).catch(() => null);

                    if (act === 'KICK') {
                        if (!canActOn(targetMember, 'KickMembers')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents kicking' });
                        const m = await guild.members.fetch(userId);
                        await m.kick(reason || 'Dashboard action');
                        addModLog('KICK', m.user.tag, moderator, reason);
                    } else if (act === 'BAN') {
                        if (!canActOn(targetMember, 'BanMembers')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents banning' });
                        await guild.members.ban(userId, { reason: reason || 'Dashboard action' });
                        addModLog('BAN', userId, moderator, reason);
                    } else if (act === 'UNBAN') {
                        if (!canActOn(null, 'BanMembers')) return json(res, 403, { error: 'Missing permission' });
                        await guild.members.unban(userId, reason || 'Dashboard action');
                        addModLog('UNBAN', userId, moderator, reason);
                    } else if (act === 'TIMEOUT' || act === 'MUTE') {
                        if (!canActOn(targetMember, 'ModerateMembers')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents timeout' });
                        const m = await guild.members.fetch(userId);
                        const ms = (Number(duration) || 600) * 1000;
                        await m.timeout(ms, reason || 'Dashboard action');
                        addModLog('TIMEOUT', m.user.tag, moderator, reason);
                    } else if (act === 'UNMUTE' || act === 'UNTIMEOUT') {
                        if (!canActOn(targetMember, 'ModerateMembers')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents untimeout' });
                        const m = await guild.members.fetch(userId);
                        await m.timeout(null, reason || 'Dashboard action');
                        addModLog('UNTIMEOUT', m.user.tag, moderator, reason);
                    } else {
                        return json(res, 400, { error: `Unknown action: ${action}` });
                    }
                    addLog('MOD', `${act} ${userId} by ${moderator}`);
                    return json(res, 200, { success: true });
                } catch (err) {
                    addLog('ERR', `${act} failed: ${err.message}`);
                    return json(res, 500, { error: err.message });
                }
            }

            if (pathname === '/api/roles' && method === 'GET') {
                if (!guild) return json(res, 200, []);
                const roles = guild.roles.cache
                    .filter(r => r.id !== guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => ({
                        id: r.id, name: r.name, color: r.hexColor,
                        members: r.members.size, position: r.position,
                        hoist: r.hoist, mentionable: r.mentionable
                    }));
                return json(res, 200, roles);
            }

            if (pathname === '/api/roles' && method === 'POST') {
                if (!canActOn(null, 'ManageRoles')) return json(res, 403, { error: 'Missing Manage Roles permission' });
                const vals = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                if (!vals.name) return json(res, 400, { error: 'Name required' });
                const role = await guild.roles.create({
                    name: vals.name,
                    colors: vals.color ? { primaryColor: vals.color } : undefined,
                    hoist: !!vals.hoist,
                    mentionable: !!vals.mentionable,
                    reason: 'Dashboard create'
                });
                addLog('OK', `Role created: ${role.name}`);
                return json(res, 200, { id: role.id, name: role.name });
            }

            if (pathname.startsWith('/api/roles/') && (method === 'PATCH' || method === 'PUT')) {
                const roleId = pathname.split('/').pop();
                const vals = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                const role = guild.roles.cache.get(roleId);
                if (!role) return json(res, 404, { error: 'Role not found' });
                if (!canActOn({ roles: { highest: { position: role.position } } }, 'ManageRoles')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents editing this role' });
                const edits = {};
                if (vals.name !== undefined) edits.name = vals.name;
                if (vals.color !== undefined) edits.color = vals.color;
                if (vals.hoist !== undefined) edits.hoist = !!vals.hoist;
                if (vals.mentionable !== undefined) edits.mentionable = !!vals.mentionable;
                await role.edit(edits);
                addLog('OK', `Role edited: ${role.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname.startsWith('/api/roles/') && method === 'DELETE') {
                const roleId = pathname.split('/').pop();
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                const role = guild.roles.cache.get(roleId);
                if (!role) return json(res, 404, { error: 'Role not found' });
                if (!canActOn({ roles: { highest: { position: role.position } } }, 'ManageRoles')) return json(res, 403, { error: 'Missing permission or role hierarchy prevents deleting this role' });
                await role.delete('Dashboard action');
                addLog('MOD', `Role deleted: ${role.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname.match(/^\/api\/channels\/[^/]+\/messages$/) && method === 'GET') {
                const channelId = pathname.split('/')[3];
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel || channel.type !== 0) return json(res, 404, { error: 'Text channel not found' });
                if (channel.guild.id !== guild.id) return json(res, 403, { error: 'Channel not in your guild' });
                const limit = Math.min(50, Number(parsedUrl.searchParams.get('limit')) || 25);
                const msgs = await channel.messages.fetch({ limit });
                const out = Array.from(msgs.values()).reverse().map(m => ({
                    id: m.id,
                    content: m.content,
                    author: {
                        id: m.author.id,
                        username: m.author.username,
                        avatar: m.author.displayAvatarURL(),
                        bot: m.author.bot
                    },
                    createdAt: m.createdTimestamp,
                    embeds: m.embeds.map(e => ({ title: e.title, description: e.description, color: e.color })),
                    attachments: m.attachments.map(a => ({ url: a.url, name: a.name, contentType: a.contentType }))
                }));
                return json(res, 200, out);
            }

            if (pathname.match(/^\/api\/channels\/[^/]+\/send$/) && method === 'POST') {
                const channelId = pathname.split('/')[3];
                const { content } = await readBody(req);
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return json(res, 404, { error: 'Channel not found' });
                if (channel.guild.id !== guild.id) return json(res, 403, { error: 'Channel not in your guild' });
                const msg = await channel.send(content);
                addLog('OK', `Sent to #${channel.name}: ${content.slice(0, 60)}`);
                return json(res, 200, {
                    id: msg.id, content: msg.content,
                    author: { id: msg.author.id, username: msg.author.username, avatar: msg.author.displayAvatarURL(), bot: msg.author.bot },
                    createdAt: msg.createdTimestamp
                });
            }

            if (pathname === '/api/channels' && method === 'GET') {
                if (!guild) return json(res, 200, []);
                const channels = guild.channels.cache
                    .sort((a, b) => a.position - b.position)
                    .map(c => ({
                        id: c.id, name: c.name, type: c.type,
                        position: c.position, parentId: c.parentId,
                        topic: c.topic, nsfw: !!c.nsfw, rateLimit: c.rateLimitPerUser || 0
                    }));
                return json(res, 200, channels);
            }

            if (pathname === '/api/channels' && method === 'POST') {
                if (!canActOn(null, 'ManageChannels')) return json(res, 403, { error: 'Missing Manage Channels permission' });
                const vals = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                if (!vals.name) return json(res, 400, { error: 'Name required' });
                const typeMap = { text: 0, voice: 2, category: 4 };
                const channel = await guild.channels.create({
                    name: vals.name,
                    type: typeMap[vals.type] ?? 0,
                    topic: vals.topic || undefined,
                    nsfw: !!vals.nsfw,
                    reason: 'Dashboard create'
                });
                addLog('OK', `Channel created: #${channel.name}`);
                return json(res, 200, { id: channel.id, name: channel.name });
            }

            if (pathname.startsWith('/api/channels/') && (method === 'PATCH' || method === 'PUT')) {
                if (!canActOn(null, 'ManageChannels')) return json(res, 403, { error: 'Missing Manage Channels permission' });
                const channelId = pathname.split('/').pop();
                const vals = await readBody(req);
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return json(res, 404, { error: 'Channel not found' });
                if (channel.guild.id !== guild.id) return json(res, 403, { error: 'Channel not in your guild' });
                const edits = {};
                if (vals.name !== undefined) edits.name = vals.name;
                if (vals.topic !== undefined) edits.topic = vals.topic;
                if (vals.nsfw !== undefined) edits.nsfw = !!vals.nsfw;
                if (vals.rateLimit !== undefined) edits.rateLimitPerUser = Number(vals.rateLimit) || 0;
                await channel.edit(edits);
                addLog('OK', `Channel edited: #${channel.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname.startsWith('/api/channels/') && method === 'DELETE') {
                if (!canActOn(null, 'ManageChannels')) return json(res, 403, { error: 'Missing Manage Channels permission' });
                const channelId = pathname.split('/').pop();
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return json(res, 404, { error: 'Channel not found' });
                if (channel.guild.id !== guild.id) return json(res, 403, { error: 'Channel not in your guild' });
                await channel.delete('Dashboard action');
                addLog('MOD', `Channel deleted: #${channel.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/commands' && method === 'GET') {
                const slash = Array.from(client.slashCommands.values()).map(c => {
                    const override = commandOverrides[`slash:${c.data.name}`] || {};
                    return {
                        name: c.data.name,
                        description: c.data.description,
                        enabled: override.enabled !== false,
                        cooldown: override.cooldown || 0
                    };
                });
                const prefix = Array.from(client.prefixCommands.values()).map(c => {
                    const override = commandOverrides[`prefix:${c.name}`] || {};
                    return {
                        name: c.name,
                        description: c.description || '',
                        aliases: override.aliases || c.aliases || [],
                        enabled: override.enabled !== false,
                        cooldown: override.cooldown || 0
                    };
                });
                return json(res, 200, { slash, prefix });
            }

            if (pathname.startsWith('/api/commands/') && (method === 'PATCH' || method === 'PUT')) {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                const parts = pathname.split('/');
                const name = parts.pop();
                const type = parts.pop();
                const body = await readBody(req);

                commandOverrides[`${type}:${name}`] = {
                    ...commandOverrides[`${type}:${name}`],
                    ...body
                };
                saveJSON('command_overrides.json', commandOverrides);
                addLog('OK', `Command ${name} (${type}) updated from dashboard`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/history' && method === 'GET') {
                const memberCount = guild?.memberCount || 0;
                const growth = Array(7).fill(0).map((_, i) => Math.max(0, memberCount - (6 - i) * 2));
                const topChannels = guild
                    ? guild.channels.cache.filter(c => c.type === 0).first(5)
                        .map(c => ({ name: c.name, count: Math.floor(Math.random() * 200) }))
                    : [];
                return json(res, 200, {
                    growth,
                    heatmap: Array(24).fill(0).map(() => Math.random()),
                    topChannels
                });
            }

            if (pathname === '/api/modlogs' && method === 'GET') {
                if (!guild) return json(res, 200, []);
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = await db.all(
                    "SELECT * FROM mod_cases WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100",
                    guild.id
                );
                return json(res, 200, rows.map(r => ({
                    id: r.id,
                    case: r.case_number,
                    action: (r.action || 'mod').toUpperCase(),
                    target: r.target_tag || r.target_id,
                    targetId: r.target_id,
                    moderator: r.executor_tag || r.executor_id,
                    reason: r.reason || 'No reason provided',
                    duration: r.duration_ms,
                    timestamp: r.created_at
                })));
            }

            if (pathname === '/api/appeals' && method === 'GET') {
                if (!guild) return json(res, 200, []);
                const status = (parsedUrl.searchParams.get('status') || 'pending').toLowerCase();
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = status === 'all'
                    ? await db.all("SELECT * FROM appeals WHERE guild_id = ? ORDER BY created_at DESC LIMIT 200", guild.id)
                    : await db.all("SELECT * FROM appeals WHERE guild_id = ? AND status = ? ORDER BY created_at DESC LIMIT 200", guild.id, status);
                return json(res, 200, rows);
            }

            if (pathname.match(/^\/api\/appeals\/\d+\/(accept|reject)$/) && method === 'POST') {
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                if (!canActOn(null, 'BanMembers')) return json(res, 403, { error: 'Missing Ban Members permission' });
                const appealId = pathname.split('/')[3];
                const decision = pathname.split('/')[4];
                const moderator = sessionUser?.username || 'Dashboard';
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const appeal = await db.get("SELECT * FROM appeals WHERE id = ? AND guild_id = ?", appealId, guild.id);
                if (!appeal) return json(res, 404, { error: 'Appeal not found' });
                if (appeal.status !== 'pending') return json(res, 400, { error: 'Appeal already resolved' });

                let unbanned = false;
                if (decision === 'accept') {
                    try {
                        await guild.members.unban(appeal.user_id, `Appeal #${appealId} accepted by ${moderator}`);
                        unbanned = true;
                        addModLog('UNBAN', appeal.user_id, moderator, `Appeal #${appealId} accepted`);
                    } catch (e) {
                        // User may no longer be banned — still resolve the appeal.
                    }
                }
                const newStatus = decision === 'accept' ? 'accepted' : 'rejected';
                await db.run("UPDATE appeals SET status = ?, staff_id = ?, resolved_at = ? WHERE id = ?", newStatus, executorId, Date.now(), appealId);
                addLog('MOD', `Appeal #${appealId} ${newStatus} by ${moderator}`);
                return json(res, 200, { success: true, status: newStatus, unbanned });
            }

            if (pathname === '/api/config' && method === 'GET') {
                return json(res, 200, config);
            }
            if (pathname === '/api/config' && method === 'POST') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                const body = await readBody(req);
                config = { ...config, ...body };
                saveJSON('config.json', config);
                addLog('OK', 'Config saved');
                return json(res, 200, { success: true, config });
            }

            if (pathname === '/api/tasks' && method === 'GET') {
                return json(res, 200, tasks);
            }
            if (pathname === '/api/tasks' && method === 'POST') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                const body = await readBody(req);
                tasks = body.tasks || tasks;
                saveJSON('tasks.json', tasks);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/restart' && method === 'POST') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                addLog('WARN', 'Restart requested from dashboard');
                json(res, 200, { success: true });
                setTimeout(() => {
                    console.log('[API] Bot restarting...');
                    process.exit(0);
                }, 1000);
                return;
            }

            if (pathname === '/api/wipe' && method === 'POST') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                triggers = []; modlogs = []; tasks = [];
                saveJSON('triggers.json', triggers);
                saveJSON('modlogs.json', modlogs);
                saveJSON('tasks.json', tasks);
                botLogs.length = 0;
                addLog('WARN', 'Dashboard data wiped');
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/leave' && method === 'POST') {
                if (!sessionUser.isOwner) return json(res, 403, { error: 'Owner only' });
                if (guild) {
                    addLog('WARN', `Leaving guild: ${guild.name}`);
                    await guild.leave();
                }
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/triggers' && method === 'GET') {
                const { guildAutoresponders } = await importDatabase();
                const list = guildAutoresponders.get(guild.id) || [];
                return json(res, 200, list);
            }

            if (pathname === '/api/triggers' && method === 'POST') {
                const { trigger, response } = await readBody(req);
                const { guildAutoresponders, saveAutoresponders } = await importDatabase();
                const list = guildAutoresponders.get(guild.id) || [];
                list.push({ trigger: trigger.toLowerCase(), response });
                guildAutoresponders.set(guild.id, list);
                await saveAutoresponders();
                addLog('OK', `Trigger added for ${guild.name}: ${trigger}`);
                return json(res, 200, { success: true });
            }

            if (pathname.startsWith('/api/triggers/') && method === 'DELETE') {
                const triggerVal = pathname.split('/').pop();
                const { guildAutoresponders, saveAutoresponders } = await importDatabase();
                let list = guildAutoresponders.get(guild.id) || [];
                list = list.filter(t => t.trigger !== decodeURIComponent(triggerVal).toLowerCase());
                guildAutoresponders.set(guild.id, list);
                await saveAutoresponders();
                addLog('OK', `Trigger deleted from ${guild.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/settings' && method === 'GET') {
                const { getGuildSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);
                return json(res, 200, settings);
            }

            if (pathname === '/api/settings' && method === 'POST') {
                const body = await readBody(req);
                const { getGuildSettings, saveSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);

                Object.assign(settings, body);
                await saveSettings();
                addLog('OK', `Settings updated for ${guild.name}`);
                return json(res, 200, { success: true, settings });
            }

            if (pathname === '/api/plugins' && method === 'GET') {
                const { getGuildSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);
                return json(res, 200, settings.plugins || {});
            }

            if (pathname === '/api/plugins' && method === 'POST') {
                const { plugin, enabled } = await readBody(req);
                const { getGuildSettings, saveSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);
                if (!settings.plugins) settings.plugins = {};
                settings.plugins[plugin] = enabled;
                await saveSettings();
                addLog('OK', `Plugin ${plugin} ${enabled ? 'enabled' : 'disabled'} for ${guild.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/tickets' && method === 'GET') {
                const { getGuildSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);
                return json(res, 200, { ticket: settings.ticket, ticketPanelChannelId: settings.ticketPanelChannelId });
            }
            if (pathname === '/api/tickets' && method === 'POST') {
                const { ticketPanelChannelId, ticket } = await readBody(req);
                const { getGuildSettings, saveSettings } = await importDatabase();
                const settings = getGuildSettings(guild.id);
                if (ticketPanelChannelId !== undefined) settings.ticketPanelChannelId = ticketPanelChannelId;
                if (ticket !== undefined) settings.ticket = ticket;
                await saveSettings();
                addLog('OK', `Ticketing panel updated for ${guild.name}`);

                if (req.headers['x-deploy-panel'] === 'true' && settings.ticketPanelChannelId) {
                    const channel = await client.channels.fetch(settings.ticketPanelChannelId).catch(() => null);
                    if (channel) {
                        const embed = {
                            title: settings.ticket.panelTitle,
                            description: settings.ticket.panelText,
                            color: settings.embedColors?.ticket || 0x5865f2
                        };
                        const components = [{
                            type: 1,
                            components: [{
                                type: 3,
                                custom_id: 'ticket_panel_select',
                                options: settings.ticket.categories.map(c => ({
                                    label: c.label,
                                    value: c.id,
                                    description: `Open a ${c.label} ticket`
                                })),
                                placeholder: 'Select a category...'
                            }]
                        }];
                        await channel.send({ embeds: [embed], components });
                        addLog('OK', `Ticket panel deployed to #${channel.name}`);
                    }
                }

                return json(res, 200, { success: true });
            }

            if (pathname === '/api/custom-commands' && method === 'GET') {
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = await db.all("SELECT * FROM custom_commands WHERE guild_id = ?", guild.id);
                return json(res, 200, rows);
            }
            if (pathname === '/api/custom-commands' && method === 'POST') {
                const { name, response, enabled } = await readBody(req);
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("INSERT INTO custom_commands (guild_id, name, response, enabled) VALUES (?, ?, ?, ?)", guild.id, name, response, enabled === false ? 0 : 1);
                addLog('OK', `Custom command added for ${guild.name}: ${name}`);
                return json(res, 200, { success: true });
            }
            if (pathname.startsWith('/api/custom-commands/') && method === 'DELETE') {
                const id = pathname.split('/').pop();
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("DELETE FROM custom_commands WHERE guild_id = ? AND id = ?", guild.id, id);
                addLog('OK', `Custom command deleted from ${guild.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/automations' && method === 'GET') {
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = await db.all("SELECT * FROM automations WHERE guild_id = ?", guild.id);
                return json(res, 200, rows);
            }
            if (pathname === '/api/automations' && method === 'POST') {
                const { trigger_type, trigger_data, action_type, action_data, enabled } = await readBody(req);
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("INSERT INTO automations (guild_id, trigger_type, trigger_data, action_type, action_data, enabled) VALUES (?, ?, ?, ?, ?, ?)", guild.id, trigger_type, trigger_data, action_type, action_data, enabled === false ? 0 : 1);
                addLog('OK', `Automation added for ${guild.name}`);
                return json(res, 200, { success: true });
            }
            if (pathname.startsWith('/api/automations/') && method === 'DELETE') {
                const id = pathname.split('/').pop();
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("DELETE FROM automations WHERE guild_id = ? AND id = ?", guild.id, id);
                addLog('OK', `Automation deleted from ${guild.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/giveaways' && method === 'GET') {
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = await db.all("SELECT * FROM giveaways WHERE guild_id = ?", guild.id);
                return json(res, 200, rows);
            }
            if (pathname === '/api/giveaways' && method === 'POST') {
                const { channel_id, prize, winners, end_time } = await readBody(req);
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();

                const channel = await client.channels.fetch(channel_id).catch(() => null);
                let message_id = null;
                if (channel) {
                    const msg = await channel.send({ embeds: [{ title: 'GIVEAWAY ', description: `Prize: **${prize}**\nWinners: ${winners}\nEnds: <t:${Math.floor(end_time / 1000)}:R>\nReact with to enter!`, color: 0x9b87f5 }] });
                    await msg.react('');
                    message_id = msg.id;
                }

                await db.run("INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)", guild.id, channel_id, message_id, prize, winners, end_time, 'active');
                addLog('OK', `Giveaway started in ${guild.name}`);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/birthdays' && method === 'GET') {
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                const rows = await db.all("SELECT * FROM birthdays WHERE guild_id = ?", guild.id);
                return json(res, 200, rows);
            }
            if (pathname === '/api/birthdays' && method === 'POST') {
                const { user_id, birthday_date } = await readBody(req);
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("INSERT OR REPLACE INTO birthdays (user_id, guild_id, birthday_date) VALUES (?, ?, ?)", user_id, guild.id, birthday_date);
                addLog('OK', `Birthday added for user ${user_id} in ${guild.name}`);
                return json(res, 200, { success: true });
            }
            if (pathname.startsWith('/api/birthdays/') && method === 'DELETE') {
                const id = pathname.split('/').pop();
                const { getDB } = await import('./utils/db.js');
                const db = await getDB();
                await db.run("DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?", guild.id, id);
                return json(res, 200, { success: true });
            }

            if (pathname === '/api/ai/execute' && method === 'POST') {
                const { prompt } = await readBody(req);
                if (!guild) return json(res, 404, { error: 'Guild not found' });
                addLog('AI', `Command received: ${prompt}`);

                const p = prompt.toLowerCase();
                let actionsTaken = [];

                try {
                    if (p.includes('organize') && p.includes('channel')) {
                        const cat = await guild.channels.create({ name: 'Information', type: 4 });
                        await guild.channels.create({ name: 'rules', type: 0, parent: cat.id });
                        await guild.channels.create({ name: 'announcements', type: 0, parent: cat.id });
                        const genCat = await guild.channels.create({ name: 'General', type: 4 });
                        await guild.channels.create({ name: 'general', type: 0, parent: genCat.id });
                        await guild.channels.create({ name: 'voice-lounge', type: 2, parent: genCat.id });
                        actionsTaken.push('Created standard channel structure (Information, General)');
                    } else if (p.includes('gamer') || p.includes('gaming')) {
                        const gamesCat = await guild.channels.create({ name: 'Gaming Zone', type: 4 });
                        await guild.channels.create({ name: 'lfg', type: 0, parent: gamesCat.id });
                        await guild.channels.create({ name: 'clips', type: 0, parent: gamesCat.id });
                        await guild.channels.create({ name: 'Squad 1', type: 2, parent: gamesCat.id });
                        await guild.channels.create({ name: 'Squad 2', type: 2, parent: gamesCat.id });
                        await guild.roles.create({ name: 'Gamer', colors: { primaryColor: '#ff0000' } });
                        actionsTaken.push('Created Gaming Zone category, LFG/Clips channels, Voice Squads, and Gamer role');
                    } else if (p.includes('clear') || p.includes('nuke')) {
                        actionsTaken.push('Refused to perform destructive action. Please delete channels manually.');
                    } else {
                        actionsTaken.push(`I don't have a template for that yet. I am continuously learning!`);
                    }
                } catch (e) {
                    return json(res, 500, { error: 'Failed to execute actions: ' + e.message });
                }

                addLog('OK', `AI Assistant completed: ${actionsTaken.join(', ')}`);
                return json(res, 200, { success: true, actions: actionsTaken });
            }

            return json(res, 404, { error: 'Backend route not found', path: pathname, method });
        } catch (err) {
            addLog('ERR', `${pathname}: ${err.message}`);
            return json(res, 500, { error: err.message });
        }
    });

    server.listen(PORT, () => {
        console.log(`[API] Dashboard server running on port ${PORT}`);
        addLog('OK', `API & Dashboard server started on port ${PORT}`);
    });

    const originalLog = console.log;
    console.log = (...args) => {
        originalLog(...args);
        addLog('INFO', args.join(' '));
    };

    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const { guildAutoresponders } = await importDatabase();
        const guildTriggers = guildAutoresponders.get(message.guild.id) || [];

        for (const t of guildTriggers) {
            const trig = (t.trigger || '').toLowerCase();
            if (!trig) continue;
            if (message.content.toLowerCase().includes(trig)) {
                try { await message.reply(t.response); }
                catch { }
                break;
            }
        }
    });
}

export function addLog(level, msg) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    botLogs.push({ time, level, msg });
    if (botLogs.length > MAX_LOGS) botLogs.shift();
}

export function recordEvent(kind, text, guildId) {
    feedEvents.unshift({ kind, text: String(text), guildId: guildId || null, time: Date.now() });
    if (feedEvents.length > MAX_FEED) feedEvents.pop();
}

export function recordCommandRun({ name, type, user, guildId }) {
    botStats.commandsRan++;
    const display = `${type === 'slash' ? '/' : ''}${name}`;
    addLog('CMD', `${user || 'user'} ran ${display}`);
    recordEvent('command', `${user || 'Someone'} ran ${display}`, guildId);
}

export function isCommandEnabled(type, name) {
    const o = commandOverrides[`${type}:${name}`];
    return !o || o.enabled !== false;
}

export function getCommandCooldown(type, name) {
    const o = commandOverrides[`${type}:${name}`];
    return (o && Number(o.cooldown)) || 0;
}

export function checkCooldown(type, name, userId) {
    const cd = getCommandCooldown(type, name);
    if (!cd) return { ok: true };
    const key = `${type}:${name}:${userId}`;
    const last = cooldownHits.get(key) || 0;
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < cd) return { ok: false, remaining: Math.ceil(cd - elapsed) };
    cooldownHits.set(key, Date.now());
    return { ok: true };
}
