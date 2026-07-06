const cron = require('node-cron');
const { supabase } = require('./supabase');

/**
 * Every 15 minutes: find active keys past their expires_at, mark them
 * expired, and strip the Premium role from whoever holds them.
 */
function startExpiryJob(client) {
  const run = async () => {
    try {
      const { data: expiredKeys, error } = await supabase
        .from('license_keys')
        .select('*')
        .eq('status', 'active')
        .not('expires_at', 'is', null)
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('[expiryJob] fetch error:', error);
        return;
      }
      if (!expiredKeys || expiredKeys.length === 0) return;

      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const logChannel = process.env.LOG_CHANNEL_ID
        ? await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null)
        : null;

      for (const rec of expiredKeys) {
        await supabase
          .from('license_keys')
          .update({ status: 'expired' })
          .eq('id', rec.id);

        if (rec.discord_user_id) {
          try {
            const member = await guild.members.fetch(rec.discord_user_id);
            if (member.roles.cache.has(process.env.PREMIUM_ROLE_ID)) {
              await member.roles.remove(process.env.PREMIUM_ROLE_ID);
            }
          } catch {
            // Member left the server or role already gone; nothing to do.
          }
        }

        if (logChannel) {
          logChannel
            .send(
              `⏱️ Key \`${rec.key_code}\` expired for <@${rec.discord_user_id || 'unknown'}>. Premium role removed.`
            )
            .catch(() => {});
        }
      }

      console.log(`[expiryJob] processed ${expiredKeys.length} expired key(s).`);
    } catch (err) {
      console.error('[expiryJob] unexpected error:', err);
    }
  };

  // Run every 15 minutes, and once shortly after startup.
  cron.schedule('*/15 * * * *', run);
  setTimeout(run, 10_000);
}

module.exports = { startExpiryJob };
