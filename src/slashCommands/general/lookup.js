import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { safeRespond } from "../../utils/helpers.js";
import { buildCoolEmbed, asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";
import { getWarningData, afkMap, cosmeticsMap, boosterRolesDB, warnings } from "../../utils/database.js";

const FLAG_BADGES = {
    Staff: "🛡️ Discord Staff",
    Partner: "🤝 Partner",
    Hypesquad: "🎉 HypeSquad Events",
    HypeSquadOnlineHouse1: "🏠 HypeSquad Bravery",
    HypeSquadOnlineHouse2: "🏠 HypeSquad Brilliance",
    HypeSquadOnlineHouse3: "🏠 HypeSquad Balance",
    BugHunterLevel1: "🐛 Bug Hunter",
    BugHunterLevel2: "🐛 Bug Hunter (Gold)",
    PremiumEarlySupporter: "💎 Early Supporter",
    VerifiedDeveloper: "✅ Early Verified Bot Developer",
    CertifiedModerator: "🛡️ Certified Moderator",
    ActiveDeveloper: "👨‍💻 Active Developer",
    VerifiedBot: "🤖 Verified Bot",
};

const STATUS_EMOJI = {
    online: "🟢 Online",
    idle: "🌙 Idle",
    dnd: "⛔ Do Not Disturb",
    offline: "⚫ Offline",
    invisible: "⚫ Invisible",
};

export async function getLookupResponse(client, executorGuildId, targetUserId, executorUser, page = 0) {
    const db = await getDB();

    // 1. Fetch User from Discord API
    let user = null;
    try {
        user = await client.users.fetch(targetUserId);
    } catch (err) {
        // User not found
    }

    // 2. Fetch Guild Member if in the executor's guild where command is run
    const executorGuild = executorGuildId ? client.guilds.cache.get(executorGuildId) : null;
    const memberInExecutorGuild = executorGuild ? await executorGuild.members.fetch(targetUserId).catch(() => null) : null;

    // Calculate account creation date from Snowflake ID
    const snowflakeTimestamp = Number((BigInt(targetUserId) >> 22n) + 1420070400000n);
    const createdTimestamp = Math.floor(snowflakeTimestamp / 1000);
    const accountAgeDays = Math.floor((Date.now() - snowflakeTimestamp) / (24 * 60 * 60 * 1000));
    const created = `<t:${createdTimestamp}:F> (<t:${createdTimestamp}:R>)`;

    // 3. Database & In-memory Queries
    // Personal Todos
    const todoCount = await db.get("SELECT COUNT(*) AS c FROM todos WHERE user_id = ?", targetUserId).then(r => r?.c ?? 0).catch(() => 0);
    
    // Active Reminders
    const reminderCount = await db.get("SELECT COUNT(*) AS c FROM reminders WHERE user_id = ?", targetUserId).then(r => r?.c ?? 0).catch(() => 0);

    // AFK Info (In-memory Map)
    const afkInfo = afkMap.get(targetUserId);

    // Cosmetics (In-memory Map)
    const cosmeticsInfo = cosmeticsMap.get(targetUserId);

    // Custom Booster Role
    const boosterRoleId = boosterRolesDB.get(targetUserId);

    // Birthday Info across all guilds
    const birthdaysList = await db.all("SELECT guild_id, birthday_date FROM birthdays WHERE user_id = ?", targetUserId).catch(() => []);

    // Chatbot Conversation History across all guilds
    const chatHistories = await db.all("SELECT guild_id, messages_json FROM conversation_history WHERE user_id = ?", targetUserId).catch(() => []);
    let totalChatMessages = 0;
    const chatMessageDetails = [];
    chatHistories.forEach(ch => {
        try {
            const parsed = JSON.parse(ch.messages_json);
            const count = Array.isArray(parsed) ? parsed.length : 0;
            totalChatMessages += count;
            if (count > 0) {
                const gName = client.guilds.cache.get(ch.guild_id)?.name || `Guild ${ch.guild_id}`;
                chatMessageDetails.push({ guildName: gName, count });
            }
        } catch {}
    });

    // Invite Joins (Where the user joined other servers)
    const inviteJoins = await db.all(
        "SELECT guild_id, inviter_id, invite_code, joined_at FROM invite_joins WHERE user_id = ? ORDER BY joined_at DESC LIMIT 5",
        targetUserId
    ).catch(() => []);

    // Invite Joins Grouped (Where the user invited others)
    const invitesGrouped = await db.all(
        "SELECT guild_id, invite_code, COUNT(*) as uses FROM invite_joins WHERE inviter_id = ? GROUP BY guild_id, invite_code",
        targetUserId
    ).catch(() => []);
    const totalInvitesGroupedCount = invitesGrouped.reduce((acc, curr) => acc + (curr.uses || 0), 0);

    // --- SCAN GUILD ACTIVE INVITE LINKS CREATED BY USER ACROSS ALL SERVERS ---
    const activeInvitesCreated = [];
    for (const [_, guild] of client.guilds.cache) {
        try {
            const memberMe = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
            if (memberMe && memberMe.permissions.has("ManageGuild")) {
                const invites = await guild.invites.fetch().catch(() => null);
                if (invites) {
                    const filtered = invites.filter(inv => inv.inviter?.id === targetUserId);
                    for (const inv of filtered.values()) {
                        activeInvitesCreated.push({
                            guildName: guild.name,
                            code: inv.code,
                            uses: inv.uses,
                            maxUses: inv.maxUses,
                            temporary: inv.temporary,
                            expiresTimestamp: inv.expiresTimestamp
                        });
                    }
                }
            }
        } catch (err) {
            // Ignore fetch errors
        }
    }

    // Warnings (Current Guild)
    let localWarningCount = 0;
    if (executorGuildId) {
        const warnData = getWarningData(executorGuildId, targetUserId);
        localWarningCount = warnData?.count ?? 0;
    }

    // Warnings (Global - across all servers)
    let globalWarningCount = 0;
    const globalWarningsList = [];
    for (const [key, val] of warnings.entries()) {
        if (key.endsWith(`-${targetUserId}`)) {
            globalWarningCount += val.count;
            const gId = key.substring(0, key.length - targetUserId.length - 1);
            const gName = client.guilds.cache.get(gId)?.name || `Guild (${gId})`;
            
            if (val.history) {
                val.history.forEach(h => {
                    if (h.action === "add") {
                        globalWarningsList.push({
                            guildName: gName,
                            by: h.by,
                            reason: h.reason || "No reason provided",
                            at: h.at
                        });
                    }
                });
            }
        }
    }

    // Mod Cases (Current Guild vs Global)
    let localModCasesCount = 0;
    let recentLocalModCases = [];
    if (executorGuildId) {
        localModCasesCount = await db.get("SELECT COUNT(*) AS c FROM mod_cases WHERE guild_id = ? AND target_id = ?", executorGuildId, targetUserId).then(r => r?.c ?? 0).catch(() => 0);
        recentLocalModCases = await db.all("SELECT case_number, action, executor_id, reason, duration_ms, created_at FROM mod_cases WHERE guild_id = ? AND target_id = ? ORDER BY case_number DESC LIMIT 3", executorGuildId, targetUserId).catch(() => []);
    }

    // Global Mod Cases (across all guilds)
    const globalModCases = await db.all("SELECT guild_id, case_number, action, executor_id, reason, duration_ms, created_at FROM mod_cases WHERE target_id = ? ORDER BY created_at DESC", targetUserId).catch(() => []);
    const globalModCasesCount = globalModCases.length;

    // Appeals (Current Guild vs Global)
    let localAppeals = [];
    if (executorGuildId) {
        localAppeals = await db.all("SELECT id, status, reason, created_at, resolved_at FROM appeals WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 3", executorGuildId, targetUserId).catch(() => []);
    }
    const globalAppeals = await db.all("SELECT guild_id, id, status, reason, created_at FROM appeals WHERE user_id = ? ORDER BY created_at DESC", targetUserId).catch(() => []);
    const globalAppealsCount = globalAppeals.length;

    // Dynamic VCs Owned
    const ownedDynamicVCs = await db.all("SELECT channel_id, guild_id, created_at FROM dynamic_vcs WHERE owner_id = ?", targetUserId).catch(() => []);

    // Audit Logs (target or executor)
    const auditLogs = await db.all(
        "SELECT guild_id, action, target_id, executor_id, reason, created_at FROM audit_log WHERE target_id = ? OR executor_id = ? ORDER BY created_at DESC LIMIT 5",
        targetUserId, targetUserId
    ).catch(() => []);

    // --- SCAN MUTUAL SERVERS ---
    const mutualServers = [];
    const fetchPromises = Array.from(client.guilds.cache.values()).map(async (guild) => {
        try {
            const m = await guild.members.fetch(targetUserId).catch(() => null);
            if (m) {
                let roleStatus = "Member 👤";
                if (guild.ownerId === targetUserId) {
                    roleStatus = "Owner 👑";
                } else if (m.permissions.has("Administrator")) {
                    roleStatus = "Admin ⚙️";
                } else if (m.permissions.has("BanMembers") || m.permissions.has("KickMembers") || m.permissions.has("ManageGuild") || m.permissions.has("ModerateMembers")) {
                    roleStatus = "Mod 🔧";
                }
                mutualServers.push({ name: guild.name, guildId: guild.id, roleStatus, joinedAt: m.joinedTimestamp });
            }
        } catch {}
    });
    await Promise.all(fetchPromises);

    // Sort mutual servers by join date (most recent join first)
    mutualServers.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

    // --- SECURITY RISK ASSESSMENT ---
    const riskFactors = [];
    const isNewAccount = accountAgeDays < 30;
    const isExtremelyNew = accountAgeDays < 7;
    const hasDefaultAvatar = user ? !user.avatar : true;
    const activeModInfractions = globalModCases.filter(c => ["ban", "kick", "timeout", "softban"].includes(c.action.toLowerCase())).length;

    if (isExtremelyNew) {
        riskFactors.push(`🚨 Account created ${accountAgeDays} days ago (very new)`);
    } else if (isNewAccount) {
        riskFactors.push(`⚠️ Account created ${accountAgeDays} days ago (new)`);
    }

    if (user && hasDefaultAvatar) {
        riskFactors.push(`👤 Default profile image (no custom avatar)`);
    }

    if (globalWarningCount >= 3) {
        riskFactors.push(`🚨 High global warnings count (${globalWarningCount} warnings)`);
    } else if (globalWarningCount > 0) {
        riskFactors.push(`⚠️ Active warnings (${globalWarningCount} globally)`);
    }

    if (activeModInfractions >= 2) {
        riskFactors.push(`🚨 High multi-server infraction history (${activeModInfractions} mod actions)`);
    } else if (activeModInfractions > 0) {
        riskFactors.push(`⚠️ Global mod history (${activeModInfractions} action(s))`);
    }

    // Guild specific key permissions checks in *all* mutual guilds
    let highestMutualPrivilege = "Member 👤";
    const mutualGuildsWithPrivs = mutualServers.filter(s => s.roleStatus !== "Member 👤");
    if (mutualGuildsWithPrivs.length > 0) {
        const isOwnerSomewhere = mutualGuildsWithPrivs.some(s => s.roleStatus.includes("Owner"));
        const isAdminSomewhere = mutualGuildsWithPrivs.some(s => s.roleStatus.includes("Admin"));
        if (isOwnerSomewhere) {
            riskFactors.push(`🔑 Server Owner in ${mutualGuildsWithPrivs.filter(s => s.roleStatus.includes("Owner")).length} mutual guild(s)`);
            highestMutualPrivilege = "Owner 👑";
        } else if (isAdminSomewhere) {
            riskFactors.push(`🔑 Administrator privileges in ${mutualGuildsWithPrivs.filter(s => s.roleStatus.includes("Admin")).length} mutual guild(s)`);
            highestMutualPrivilege = "Admin ⚙️";
        } else {
            riskFactors.push(`🔑 Moderator permissions in ${mutualGuildsWithPrivs.filter(s => s.roleStatus.includes("Mod")).length} mutual guild(s)`);
            highestMutualPrivilege = "Mod 🔧";
        }
    }

    // Determine final risk rating
    let riskLevel = "🟢 Low Risk";
    if (isExtremelyNew || globalWarningCount >= 3 || activeModInfractions >= 2) {
        riskLevel = "🔴 High Risk";
    } else if (isNewAccount || hasDefaultAvatar || globalWarningCount > 0 || activeModInfractions > 0 || mutualGuildsWithPrivs.length > 0) {
        riskLevel = "🟡 Medium Risk";
    }

    // 4. Building the requested page
    let embed = null;
    const embedTitle = `🔍 User Audit — ${user?.tag || `ID: ${targetUserId}`}`;
    const embedDesc = `<@${targetUserId}>`;

    const buildBaseEmbed = (titleSuffix, type = "info") => {
        const emb = buildCoolEmbed({
            guildId: executorGuildId,
            type: memberInExecutorGuild ? type : "general",
            title: `${embedTitle} [${titleSuffix}]`,
            description: embedDesc,
            showAuthor: true,
            showFooter: false,
            client,
        });

        if (user) {
            emb.setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));
            const banner = user.bannerURL?.({ size: 1024, dynamic: true });
            if (banner) emb.setImage(banner);
            if (user.accentColor) emb.setColor(user.accentColor);
        }

        if (memberInExecutorGuild?.displayHexColor && memberInExecutorGuild.displayHexColor !== "#000000") {
            emb.setColor(memberInExecutorGuild.displayHexColor);
        }

        // Adjust color based on risk rating
        if (riskLevel === "🔴 High Risk") emb.setColor(0xed4245);
        else if (riskLevel === "🟡 Medium Risk") emb.setColor(0xfee75c);

        return emb;
    };

    if (page === 0) {
        // Page 1: Profile & Security
        embed = buildBaseEmbed("Page 1/4: Profile & Security", "info");
        
        const flags = user?.flags?.toArray?.() ?? [];
        const badges = flags.map(f => FLAG_BADGES[f]).filter(Boolean);
        if (user?.bot) badges.unshift("🤖 Bot");
        if (memberInExecutorGuild?.premiumSince) badges.push("💎 Server Booster (Here)");

        const fields = [
            { name: "👤 User Account", value: `**Tag:** \`${user?.tag || "Unknown"}\`\n**ID:** \`${targetUserId}\`\n**Bot:** ${user?.bot ? "Yes" : "No"}\n**Mutual Servers:** \`${mutualServers.length}\``, inline: true },
            { name: "📅 Account Age", value: `${created}\n**Exact Age:** \`${accountAgeDays} days\``, inline: true },
        ];

        // Add Security Assessment
        const riskValue = riskFactors.length ? riskFactors.join("\n") : "• No security risk factors detected.";
        fields.push({ name: `🛡️ Security Risk Assessment: ${riskLevel}`, value: riskValue, inline: false });

        if (badges.length) {
            fields.push({ name: "🏅 Badges & Details", value: badges.join("\n"), inline: false });
        }

        embed.addFields(fields);

    } else if (page === 1) {
        // Page 2: Servers & Privileges
        embed = buildBaseEmbed("Page 2/4: Servers & Privileges", "info");
        const fields = [];

        // Current Guild details
        if (memberInExecutorGuild) {
            const keyPerms = memberInExecutorGuild.permissions?.toArray?.()?.filter(p => [
                "Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "BanMembers", "KickMembers", "ModerateMembers"
            ].includes(p)) ?? [];

            const status = memberInExecutorGuild.presence?.status ? STATUS_EMOJI[memberInExecutorGuild.presence.status] : null;
            const activity = memberInExecutorGuild.presence?.activities?.[0];
            const activityText = activity ? `${activity.type === 4 ? "💬" : "🎮"} ${activity.state || activity.name}` : null;
            const joinedHere = `<t:${Math.floor(memberInExecutorGuild.joinedTimestamp / 1000)}:F> (<t:${Math.floor(memberInExecutorGuild.joinedTimestamp / 1000)}:R>)`;

            let memberVal = `**Nickname:** ${memberInExecutorGuild.nickname || "None"}\n**Joined Here:** ${joinedHere}`;
            if (status) memberVal += `\n**Status:** ${status}`;
            if (activityText) memberVal += `\n**Activity:** ${activityText}`;
            if (memberInExecutorGuild.premiumSinceTimestamp) memberVal += `\n**Boosting:** <t:${Math.floor(memberInExecutorGuild.premiumSinceTimestamp / 1000)}:R>`;

            fields.push({ name: "📥 Local Server Membership", value: memberVal, inline: false });

            if (keyPerms.length) {
                fields.push({ name: "🔑 Local Key Permissions", value: keyPerms.map(p => `\`${p}\``).join(", "), inline: false });
            }

            const roles = memberInExecutorGuild.roles.cache
                .filter((r) => r.id !== executorGuildId)
                .sort((a, b) => b.position - a.position)
                .map((r) => r.toString());
            if (roles.length) {
                const rolesValue = roles.slice(0, 15).join(" ") + (roles.length > 15 ? `\n*+${roles.length - 15} more*` : "");
                fields.push({ name: `🎭 Local Roles [${roles.length}]`, value: rolesValue.slice(0, 1024), inline: false });
            }
        } else {
            fields.push({ name: "📥 Local Server Membership", value: "*This user is not a member of the current server.*", inline: false });
        }

        // Mutual Servers
        if (mutualServers.length > 0) {
            const serverLines = mutualServers.map(s => {
                const joinedText = s.joinedAt ? `<t:${Math.floor(s.joinedAt / 1000)}:R>` : "Unknown date";
                return `• **${s.name}** (${s.roleStatus}) — Joined ${joinedText}`;
            });
            const sliced = serverLines.slice(0, 15).join("\n") + (serverLines.length > 15 ? `\n*... and ${serverLines.length - 15} more mutual server(s)*` : "");
            fields.push({ name: `👥 Mutual Servers [${mutualServers.length}]`, value: sliced, inline: false });
        } else {
            fields.push({ name: "👥 Mutual Servers", value: "*No shared mutual servers found.*", inline: false });
        }

        embed.addFields(fields);

    } else if (page === 2) {
        // Page 3: Moderation History
        embed = buildBaseEmbed("Page 3/4: Infractions & Moderation", "warning");
        const fields = [];

        // Global Warnings
        if (globalWarningCount > 0) {
            const recent = globalWarningsList
                .slice(-5)
                .reverse()
                .map((h) => `• **[${h.guildName}]** <t:${Math.floor(h.at / 1000)}:d> by <@${h.by}>: *${String(h.reason).slice(0, 50)}*`);

            let warnText = `**Active Warnings:** \`${globalWarningCount} globally\` (Local to this guild: \`${localWarningCount}\`)\n${recent.join("\n")}`;
            fields.push({ name: "⚠️ Global Warning History", value: warnText.slice(0, 1024), inline: false });
        } else {
            fields.push({ name: "⚠️ Global Warning History", value: "• *Clean record (zero warnings globally).* ", inline: false });
        }

        // Global Mod Cases
        if (globalModCasesCount > 0) {
            const casesText = globalModCases.slice(0, 5).map(c => {
                const gName = client.guilds.cache.get(c.guild_id)?.name || `Guild (${c.guild_id})`;
                const actionEmoji = c.action === "ban" ? "🔨" : c.action === "kick" ? "👢" : c.action === "timeout" ? "⏳" : "⚠️";
                const durText = c.duration_ms ? ` (${Math.floor(c.duration_ms / 60000)}m)` : "";
                return `• **[${gName}] Case #${c.case_number}** ${actionEmoji} \`${c.action.toUpperCase()}\`${durText} by <@${c.executor_id}>: *${String(c.reason || "No reason").slice(0, 60)}*`;
            }).join("\n");

            fields.push({ name: `🔨 Global Moderation Cases [${globalModCasesCount}]`, value: casesText.slice(0, 1024), inline: false });
        } else {
            fields.push({ name: "🔨 Global Moderation Cases", value: "• *Clean mod log (zero moderation cases).* ", inline: false });
        }

        // Global Appeals
        if (globalAppealsCount > 0) {
            const appealsText = globalAppeals.slice(0, 3).map(a => {
                const gName = client.guilds.cache.get(a.guild_id)?.name || `Guild (${a.guild_id})`;
                const statusEmoji = a.status === "accepted" ? "🟢" : a.status === "denied" ? "🔴" : "🟡";
                return `• **[${gName}] Appeal #${a.id}** ${statusEmoji} \`${a.status.toUpperCase()}\` (Submitted <t:${Math.floor(a.created_at / 1000)}:R>)`;
            }).join("\n");
            fields.push({ name: `⚖️ Global Submitted Appeals [${globalAppealsCount}]`, value: appealsText.slice(0, 1024), inline: false });
        }

        embed.addFields(fields);

    } else if (page === 3) {
        // Page 4: Bot Records & Activity
        embed = buildBaseEmbed("Page 4/4: Bot Records & Activity", "info");
        const fields = [];

        // Invites Details
        const inviteLines = [];
        if (inviteJoins.length > 0) {
            inviteJoins.forEach(j => {
                const gName = client.guilds.cache.get(j.guild_id)?.name || `Guild (${j.guild_id})`;
                inviteLines.push(`• Joined **${gName}** via invite \`${j.invite_code}\` by <@${j.inviter_id}> (<t:${Math.floor(j.joined_at / 1000)}:R>)`);
            });
        }
        if (totalInvitesGroupedCount > 0) {
            inviteLines.push(`• Invited **${totalInvitesGroupedCount}** users across all servers.`);
        }
        if (activeInvitesCreated.length > 0) {
            const act = activeInvitesCreated.slice(0, 3).map(inv => {
                const exp = inv.expiresTimestamp ? `<t:${Math.floor(inv.expiresTimestamp / 1000)}:R>` : "Permanent ♾️";
                return `• **[${inv.guildName}]** \`${inv.code}\` (uses: ${inv.uses}) exp: ${exp}`;
            });
            inviteLines.push(`**Active Invites Created:**\n${act.join("\n")}`);
        }
        if (inviteLines.length > 0) {
            fields.push({ name: "🚪 Invite Records", value: inviteLines.join("\n").slice(0, 1024), inline: false });
        }

        // Database overview (AFK, cosmetics, todos, reminders, birthdays)
        const dbRecords = [];
        if (afkInfo) {
            dbRecords.push(`😴 **AFK:** Yes (since <t:${Math.floor(afkInfo.since / 1000)}:R>) — *Reason:* ${afkInfo.reason || "None"}`);
        }
        if (cosmeticsInfo && (cosmeticsInfo.manualTitle || cosmeticsInfo.autoTitle)) {
            dbRecords.push(`✨ **Titles:** ${cosmeticsInfo.manualTitle ? `\`${cosmeticsInfo.manualTitle}\` (Manual)` : ""} ${cosmeticsInfo.autoTitle ? `\`${cosmeticsInfo.autoTitle}\` (Auto)` : ""}`);
        }
        if (boosterRoleId) {
            dbRecords.push(`💜 **Custom Booster Role:** <@&${boosterRoleId}>`);
        }
        if (birthdaysList.length > 0) {
            const bdays = birthdaysList.map(b => {
                const gName = client.guilds.cache.get(b.guild_id)?.name || `Guild (${b.guild_id})`;
                return `**[${gName}]** \`${b.birthday_date}\``;
            }).join(", ");
            dbRecords.push(`🎂 **Birthdays:** ${bdays}`);
        }
        if (todoCount > 0 || reminderCount > 0) {
            dbRecords.push(`📝 **Lists:** \`${todoCount}\` Todos • \`${reminderCount}\` Active Reminders`);
        }
        if (totalChatMessages > 0) {
            dbRecords.push(`💬 **AI Chat History:** \`${totalChatMessages}\` messages stored globally`);
        }
        if (ownedDynamicVCs.length > 0) {
            dbRecords.push(`🔊 **VC Ownership:** Owns \`${ownedDynamicVCs.length}\` dynamic voice channel(s)`);
        }

        if (dbRecords.length > 0) {
            fields.push({ name: "🤖 Bot Database Records", value: dbRecords.join("\n").slice(0, 1024), inline: false });
        }

        // Audit Logs (recent target/executor activities)
        if (auditLogs.length > 0) {
            const logsText = auditLogs.map(l => {
                const gName = client.guilds.cache.get(l.guild_id)?.name || `Guild (${l.guild_id})`;
                const roleType = l.executor_id === targetUserId ? "Executor" : "Target";
                return `• **[${gName}]** \`${l.action}\` as *${roleType}* (by <@${l.executor_id}>) <t:${Math.floor(l.created_at / 1000)}:R>`;
            }).join("\n");
            fields.push({ name: "⚙️ Recent Audit Log Activity", value: logsText.slice(0, 1024), inline: false });
        }

        embed.addFields(fields);
    }

    embed.setFooter({
        text: `Requested by ${executorUser.tag} • ID: ${targetUserId}`,
        iconURL: executorUser.displayAvatarURL({ dynamic: true }),
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lookup_page:${targetUserId}:0`)
            .setLabel("Profile 👤")
            .setStyle(page === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`lookup_page:${targetUserId}:1`)
            .setLabel("Servers 👥")
            .setStyle(page === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(page === 1),
        new ButtonBuilder()
            .setCustomId(`lookup_page:${targetUserId}:2`)
            .setLabel("Moderation 🔨")
            .setStyle(page === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(page === 2),
        new ButtonBuilder()
            .setCustomId(`lookup_page:${targetUserId}:3`)
            .setLabel("Bot Activity 📝")
            .setStyle(page === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(page === 3)
    );

    return { embeds: [embed], components: [row] };
}

export default {
    data: {
        name: "lookup",
        description: "Retrieve all available bot and guild information about a user by ID",
        options: [
            {
                name: "id",
                description: "The Discord User ID to lookup",
                type: 3, // STRING
                required: true
            }
        ]
    },
    async execute(i) {
        const userId = i.options.getString("id").trim();
        
        // Validate ID format (snowflake: 17 to 20 digits)
        if (!/^\d{17,20}$/.test(userId)) {
            return safeRespond(i, asEmbedPayload({
                guildId: i.guild?.id,
                type: "error",
                title: "❌ Invalid ID Format",
                description: "The provided user ID is not a valid Discord Snowflake (must be 17-20 digits).",
                ephemeral: true
            }));
        }

        const response = await getLookupResponse(i.client, i.guild?.id, userId, i.user, 0);
        return safeRespond(i, response);
    }
};
