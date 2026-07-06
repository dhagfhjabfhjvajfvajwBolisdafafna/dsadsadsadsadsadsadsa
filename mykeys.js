const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');

function fmt(date) {
  if (!date) return 'never (lifetime)';
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mykeys')
    .setDescription('See your redeemed license key(s) and expiry'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { data: records, error } = await supabase
      .from('license_keys')
      .select('key_code, status, expires_at, activated_at')
      .eq('discord_user_id', interaction.user.id)
      .order('activated_at', { ascending: false });

    if (error) {
      console.error('[mykeys] fetch error:', error);
      return interaction.editReply('❌ Something went wrong.');
    }

    if (!records || records.length === 0) {
      return interaction.editReply("You haven't redeemed any keys yet. Use `/redeem` with your key.");
    }

    const lines = records.map(
      (r) => `\`${r.key_code}\` — ${r.status} — expires: ${fmt(r.expires_at)}`
    );

    return interaction.editReply(lines.join('\n'));
  },
};
