import { safeRespond } from "../../utils/helpers.js";
import { buildCoolEmbed, asEmbedPayload } from "../../utils/embeds.js";
import { getDB } from "../../utils/db.js";
import { getWarningData, afkMap, cosmeticsMap, boosterRolesDB } from "../../utils/database.js";

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
        await i.deferReply().catch(() => null);

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

        // 1. Fetch User from Discord API
        let user = null;
        try {
            user = await i.client.users.fetch(userId);
        } catch (err) {
            // User not found in Discord, but we can still check database for records
        }

        // 2. Fetch Guild Member if in guild where command is run
        const member = i.guild ? await i.guild.members.fetch(userId).catch(() => null) : null;

        const db = await getDB();
        const guildId = i.guild?.id;

        // 3. Database & In-memory Queries
        // Personal Todos
        const todoCount = await db.get("SELECT COUNT(*) AS c FROM todos WHERE user_id = ?", userId).then(r => r?.c ?? 0).catch(() => 0);
        
        // Active Reminders
        const reminderCount = await db.get("SELECT COUNT(*) AS c FROM reminders WHERE user_id = ?", userId).then(r => r?.c ?? 0).catch(() => 0);

        // AFK Info (In-memory Map)
        const afkInfo = afkMap.get(userId);

        // Cosmetics (In-memory Map)
        const cosmeticsInfo = cosmeticsMap.get(userId);

        // Custom Booster Role
        const boosterRoleId = boosterRolesDB.get(userId);

        // Invite Join Record (if in guild)
        let inviteJoinInfo = null;
        let invitedCount = 0;
        if (guildId) {
            inviteJoinInfo = await db.get("SELECT inviter_id, invite_code, joined_at FROM invite_joins WHERE guild_id = ? AND user_id = ? LIMIT 1", guildId, userId).catch(() => null);
            invitedCount = await db.get("SELECT COUNT(*) AS c FROM invite_joins WHERE guild_id = ? AND inviter_id = ?", guildId, userId).then(r => r?.c ?? 0).catch(() => 0);
        }

        // Birthday Date (if in guild)
        const birthdayInfo = guildId ? await db.get("SELECT birthday_date FROM birthdays WHERE guild_id = ? AND user_id = ? LIMIT 1", guildId, userId).catch(() => null) : null;

        // Chatbot Conversation History (if in guild)
        let chatMessageCount = 0;
        if (guildId) {
            const chatHistory = await db.get("SELECT messages_json FROM conversation_history WHERE user_id = ? AND guild_id = ?", userId, guildId).catch(() => null);
            if (chatHistory?.messages_json) {
                try {
                    const parsed = JSON.parse(chatHistory.messages_json);
                    chatMessageCount = Array.isArray(parsed) ? parsed.length : 0;
                } catch {}
            }
        }

        // Warnings (In-memory Map & SQLite for this guild)
        let warningCount = 0;
        let warningHistory = [];
        if (guildId) {
            const warnData = getWarningData(guildId, userId);
            warningCount = warnData?.count ?? 0;
            warningHistory = warnData?.history ?? [];
        }

        // Mod Cases (for this guild)
        let totalModCases = 0;
        let recentModCases = [];
        if (guildId) {
            totalModCases = await db.get("SELECT COUNT(*) AS c FROM mod_cases WHERE guild_id = ? AND target_id = ?", guildId, userId).then(r => r?.c ?? 0).catch(() => 0);
            recentModCases = await db.all("SELECT case_number, action, executor_id, reason, duration_ms, created_at FROM mod_cases WHERE guild_id = ? AND target_id = ? ORDER BY case_number DESC LIMIT 3", guildId, userId).catch(() => []);
        }

        // Ban Appeals (for this guild)
        let appeals = [];
        if (guildId) {
            appeals = await db.all("SELECT id, status, reason, created_at, resolved_at FROM appeals WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 3", guildId, userId).catch(() => []);
        }

        // 4. Constructing the Embed
        if (!user) {
            // User not found in Discord (invalid ID or deleted user, or bot cannot fetch)
            // But we found database history!
            const embed = buildCoolEmbed({
                guildId,
                type: "warning",
                title: `🔍 ID Lookup — Not Found in Discord`,
                description: `Unable to fetch user details from Discord for ID: \`${userId}\`.\nHowever, local database records exist.`,
                showAuthor: true,
                client: i.client,
            });

            const dbFields = [];

            // Add Warning details
            if (warningCount > 0) {
                dbFields.push({ name: "⚠️ Warnings", value: `**Active:** \`${warningCount}\``, inline: true });
            }

            // Add Mod cases
            if (totalModCases > 0) {
                dbFields.push({ name: "🔨 Mod Cases", value: `**Total:** \`${totalModCases}\``, inline: true });
            }

            // Add Todos & Reminders
            if (todoCount > 0 || reminderCount > 0) {
                dbFields.push({ name: "📝 Lists & Reminders", value: `• Todos: \`${todoCount}\`\n• Reminders: \`${reminderCount}\``, inline: true });
            }

            // Add AFK
            if (afkInfo) {
                dbFields.push({ name: "😴 AFK Status", value: `AFK since <t:${Math.floor(afkInfo.since / 1000)}:R>\n*Reason:* ${afkInfo.reason || "None"}`, inline: false });
            }

            // Add Cosmetics
            if (cosmeticsInfo && (cosmeticsInfo.manualTitle || cosmeticsInfo.autoTitle)) {
                dbFields.push({ name: "✨ Cosmetics", value: `• Manual: ${cosmeticsInfo.manualTitle || "None"}\n• Auto: ${cosmeticsInfo.autoTitle || "None"}`, inline: true });
            }

            if (dbFields.length === 0) {
                return safeRespond(i, asEmbedPayload({
                    guildId,
                    type: "error",
                    title: "❌ No Records Found",
                    description: `User with ID \`${userId}\` was not found on Discord, and has zero bot database history.`,
                    ephemeral: true
                }));
            }

            embed.addFields(dbFields);
            embed.setFooter({
                text: `Requested by ${i.user.tag} • Database Only Mode`,
                iconURL: i.user.displayAvatarURL({ dynamic: true }),
            });

            return safeRespond(i, { embeds: [embed] });
        }

        // User exists!
        const created = `<t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`;
        const joined = member?.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
            : "N/A";

        const flags = user.flags?.toArray?.() ?? [];
        const badges = flags.map(f => FLAG_BADGES[f]).filter(Boolean);
        if (user.bot) badges.unshift("🤖 Bot");
        if (member?.premiumSince) badges.push("💎 Server Booster");

        const status = member?.presence?.status ? STATUS_EMOJI[member.presence.status] : null;
        const activity = member?.presence?.activities?.[0];
        const activityText = activity ? `${activity.type === 4 ? "💬" : "🎮"} ${activity.state || activity.name}` : null;

        const fields = [
            { name: "👤 User Account", value: `**Tag:** \`${user.tag}\`\n**ID:** \`${user.id}\`\n**Mention:** <@${user.id}>\n**Bot:** ${user.bot ? "Yes" : "No"}`, inline: true },
            { name: "📅 Account Created", value: created, inline: true },
        ];

        // Guild Member details
        if (member) {
            const keyPerms = member.permissions?.toArray?.()?.filter(p => [
                "Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "BanMembers", "KickMembers", "ModerateMembers"
            ].includes(p)) ?? [];

            let memberVal = `**Nickname:** ${member.nickname || "None"}\n**Joined:** ${joined}`;
            if (status) memberVal += `\n**Status:** ${status}`;
            if (activityText) memberVal += `\n**Activity:** ${activityText}`;
            if (member.premiumSinceTimestamp) memberVal += `\n**Boosting:** <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`;

            fields.push({ name: "📥 Server Membership", value: memberVal, inline: false });

            // Key permissions
            if (keyPerms.length) {
                fields.push({ name: "🔑 Key Permissions", value: keyPerms.map(p => `\`${p}\``).join(", "), inline: false });
            }

            // Roles
            const roles = member.roles.cache
                .filter((r) => r.id !== i.guild.id)
                .sort((a, b) => b.position - a.position)
                .map((r) => r.toString());
            if (roles.length) {
                const rolesValue = roles.slice(0, 25).join(" ") + (roles.length > 25 ? `\n*+${roles.length - 25} more*` : "");
                fields.push({ name: `🎭 Roles [${roles.length}]`, value: rolesValue.slice(0, 1024), inline: false });
            }
        }

        // Add badges
        if (badges.length) {
            fields.push({ name: "🏅 Badges", value: badges.join("\n"), inline: true });
        }

        // Database overview
        const dbRecords = [];
        
        // AFK Info
        if (afkInfo) {
            dbRecords.push(`😴 **AFK:** Yes (since <t:${Math.floor(afkInfo.since / 1000)}:R>) — *Reason:* ${afkInfo.reason || "None"}`);
        }

        // Cosmetics
        if (cosmeticsInfo && (cosmeticsInfo.manualTitle || cosmeticsInfo.autoTitle)) {
            dbRecords.push(`✨ **Titles:** ${cosmeticsInfo.manualTitle ? `\`${cosmeticsInfo.manualTitle}\` (Manual)` : ""} ${cosmeticsInfo.autoTitle ? `\`${cosmeticsInfo.autoTitle}\` (Auto)` : ""}`);
        }

        // Booster Role
        if (boosterRoleId) {
            dbRecords.push(`💜 **Custom Booster Role:** <@&${boosterRoleId}>`);
        }

        // Birthday Info
        if (birthdayInfo?.birthday_date) {
            dbRecords.push(`🎂 **Birthday:** \`${birthdayInfo.birthday_date}\``);
        }

        // Personal lists
        if (todoCount > 0 || reminderCount > 0) {
            dbRecords.push(`📝 **User Data:** \`${todoCount}\` Todos • \`${reminderCount}\` Active Reminders`);
        }

        // Chat memory
        if (chatMessageCount > 0) {
            dbRecords.push(`💬 **AI Chat memory:** \`${chatMessageCount}\` messages saved in this guild`);
        }

        // Invites Info
        if (inviteJoinInfo) {
            dbRecords.push(`🚪 **Joined Via:** \`${inviteJoinInfo.invite_code}\` by <@${inviteJoinInfo.inviter_id}> (<t:${Math.floor(inviteJoinInfo.joined_at / 1000)}:R>)`);
        }
        if (invitedCount > 0) {
            dbRecords.push(`🤝 **Invites:** Invited \`${invitedCount}\` users to this server`);
        }

        if (dbRecords.length) {
            fields.push({ name: "🤖 Bot Database Records", value: dbRecords.join("\n").slice(0, 1024), inline: false });
        }

        // Warnings Info
        if (warningCount > 0) {
            const recent = warningHistory
                .filter(h => h.action === "add")
                .slice(-3)
                .reverse()
                .map((h, idx) => `• <t:${Math.floor(h.at / 1000)}:d> by <@${h.by}>: *${String(h.reason || "No reason").slice(0, 50)}*`);

            let warnText = `**Active Warnings:** \`${warningCount}\``;
            if (recent.length) warnText += `\n${recent.join("\n")}`;
            fields.push({ name: "⚠️ Warning Record", value: warnText.slice(0, 1024), inline: false });
        }

        // Mod cases history
        if (totalModCases > 0) {
            const casesText = recentModCases.map(c => {
                const actionEmoji = c.action === "ban" ? "🔨" : c.action === "kick" ? "👢" : c.action === "timeout" ? "⏳" : "⚠️";
                return `• **Case #${c.case_number}** ${actionEmoji} \`${c.action.toUpperCase()}\` by <@${c.executor_id}>: *${String(c.reason || "No reason").slice(0, 60)}*`;
            }).join("\n");

            fields.push({ name: `🔨 Moderation Cases [${totalModCases}]`, value: casesText.slice(0, 1024), inline: false });
        }

        // Appeals
        if (appeals.length) {
            const appealsText = appeals.map(a => {
                const statusEmoji = a.status === "accepted" ? "🟢" : a.status === "denied" ? "🔴" : "🟡";
                return `• **Appeal #${a.id}** ${statusEmoji} \`${a.status.toUpperCase()}\` (Submitted <t:${Math.floor(a.created_at / 1000)}:R>)`;
            }).join("\n");
            fields.push({ name: "⚖️ Submitted Appeals", value: appealsText.slice(0, 1024), inline: false });
        }

        const embed = buildCoolEmbed({
            guildId,
            type: member ? "info" : "general",
            title: `🔍 User Audit & Information — ${user.tag}`,
            description: `<@${user.id}>`,
            fields,
            showAuthor: true,
            showFooter: false,
            client: i.client,
        });

        embed.setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));

        const banner = user.bannerURL?.({ size: 1024, dynamic: true });
        if (banner) embed.setImage(banner);

        if (user.accentColor) embed.setColor(user.accentColor);
        else if (member?.displayHexColor && member.displayHexColor !== "#000000") embed.setColor(member.displayHexColor);

        embed.setFooter({
            text: `Requested by ${i.user.tag} • ID: ${user.id}`,
            iconURL: i.user.displayAvatarURL({ dynamic: true }),
        });

        return safeRespond(i, { embeds: [embed] });
    }
};
