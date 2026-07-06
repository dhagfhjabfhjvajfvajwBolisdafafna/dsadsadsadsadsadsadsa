const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function logToChannel(interaction, message) {
  if (!process.env.LOG_CHANNEL_ID) return;
  try {
    const channel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
    await channel.send(message);
  } catch (err) {
    console.error('[redeem] failed to log to staff channel:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a Focuss Tweaks license key')
    .addStringOption((opt) =>
      opt.setName('key').setDescription('Your license key').setRequired(true)
    ),

  async execute(interaction) {
    const rawKey = interaction.options.getString('key', true).trim().toUpperCase();
    const userId = interaction.user.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Check ban status first.
    const { data: ban } = await supabase
      .from('banned_users')
      .select('discord_user_id')
      .eq('discord_user_id', userId)
      .maybeSingle();

    if (ban) {
      await logToChannel(interaction, `🚫 Banned user <@${userId}> attempted to redeem \`${rawKey}\`.`);
      return interaction.editReply('❌ You are banned from redeeming license keys.');
    }

    const { data: record, error: fetchError } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key_code', rawKey)
      .maybeSingle();

    if (fetchError) {
      console.error('[redeem] fetch error:', fetchError);
      return interaction.editReply('❌ Something went wrong. Try again later.');
    }

    if (!record) {
      await logToChannel(interaction, `❌ <@${userId}> tried an invalid key \`${rawKey}\`.`);
      return interaction.editReply('❌ That key does not exist.');
    }

    if (record.status === 'revoked') {
      await logToChannel(interaction, `❌ <@${userId}> tried a revoked key \`${rawKey}\`.`);
      return interaction.editReply('❌ This key has been revoked.');
    }

    if (record.status === 'expired') {
      await logToChannel(interaction, `❌ <@${userId}> tried an expired key \`${rawKey}\`.`);
      return interaction.editReply('❌ This key has expired.');
    }

    if (record.status === 'active' && record.discord_user_id && record.discord_user_id !== userId) {
      await logToChannel(
        interaction,
        `❌ <@${userId}> tried a key \`${rawKey}\` already bound to <@${record.discord_user_id}>.`
      );
      return interaction.editReply('❌ This key is already bound to a different Discord account.');
    }

    if (record.status === 'active' && record.discord_user_id === userId) {
      return interaction.editReply(
        `ℹ️ You already redeemed this key. Expires: ${
          record.expires_at ? `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R>` : 'never (lifetime)'
        }`
      );
    }

    if (record.status !== 'unused') {
      return interaction.editReply('❌ This key cannot be redeemed.');
    }

    // Unused key — activate it.
    const now = new Date();
    const expiresAt = record.duration_days ? addDays(now, record.duration_days) : null;

    const { error: updateError } = await supabase
      .from('license_keys')
      .update({
        status: 'active',
        discord_user_id: userId,
        activated_at: now.toISOString(),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('[redeem] update error:', updateError);
      return interaction.editReply('❌ Failed to redeem key. Try again later.');
    }

    try {
      await interaction.member.roles.add(process.env.PREMIUM_ROLE_ID);
    } catch (err) {
      console.error('[redeem] role assign failed:', err);
      await logToChannel(interaction, `⚠️ Redeemed \`${rawKey}\` for <@${userId}> but role assignment failed.`);
    }

    const expiryLabel = expiresAt
      ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`
      : 'never (lifetime)';

    await logToChannel(
      interaction,
      `✅ <@${userId}> redeemed \`${rawKey}\` — expires: ${expiryLabel}`
    );

    return interaction.editReply(`✅ Key redeemed! Premium access expires: ${expiryLabel}`);
  },
};
