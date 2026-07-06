const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');

function fmt(date) {
  if (!date) return 'never';
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:F>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription("Look up a key's status (admin only)")
    .addStringOption((opt) =>
      opt.setName('key').setDescription('The key to look up').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({
        content: '❌ You do not have permission to run this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const key = interaction.options.getString('key', true).trim().toUpperCase();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { data: record, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key_code', key)
      .maybeSingle();

    if (error) {
      console.error('[lookup] fetch error:', error);
      return interaction.editReply('❌ Something went wrong.');
    }
    if (!record) {
      return interaction.editReply('❌ That key does not exist.');
    }

    const lines = [
      `**Key:** \`${record.key_code}\``,
      `**Status:** ${record.status}`,
      `**Owner:** ${record.discord_user_id ? `<@${record.discord_user_id}>` : 'unbound'}`,
      `**Duration:** ${record.duration_days ? `${record.duration_days} days` : 'lifetime'}`,
      `**HWID bound:** ${record.hwid ? `\`${record.hwid}\`` : 'none'}`,
      `**Created:** ${fmt(record.created_at)} by <@${record.created_by}>`,
      `**Activated:** ${fmt(record.activated_at)}`,
      `**Expires:** ${fmt(record.expires_at)}`,
      record.note ? `**Note:** ${record.note}` : null,
    ].filter(Boolean);

    return interaction.editReply(lines.join('\n'));
  },
};
