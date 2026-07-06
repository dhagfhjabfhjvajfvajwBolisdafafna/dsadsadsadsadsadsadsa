const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revokekey')
    .setDescription('Revoke a license key immediately (admin only)')
    .addStringOption((opt) =>
      opt.setName('key').setDescription('The key to revoke').setRequired(true)
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

    const { data: record, error: fetchError } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key_code', key)
      .maybeSingle();

    if (fetchError) {
      console.error('[revokekey] fetch error:', fetchError);
      return interaction.editReply('❌ Something went wrong. Try again later.');
    }
    if (!record) {
      return interaction.editReply('❌ That key does not exist.');
    }

    const { error: updateError } = await supabase
      .from('license_keys')
      .update({ status: 'revoked' })
      .eq('id', record.id);

    if (updateError) {
      console.error('[revokekey] update error:', updateError);
      return interaction.editReply('❌ Failed to revoke key.');
    }

    let roleRemoved = false;
    if (record.discord_user_id) {
      try {
        const member = await interaction.guild.members.fetch(record.discord_user_id);
        if (member.roles.cache.has(process.env.PREMIUM_ROLE_ID)) {
          await member.roles.remove(process.env.PREMIUM_ROLE_ID);
          roleRemoved = true;
        }
      } catch {
        // Member not in server anymore; nothing to remove.
      }
    }

    if (process.env.LOG_CHANNEL_ID) {
      interaction.client.channels
        .fetch(process.env.LOG_CHANNEL_ID)
        .then((ch) =>
          ch.send(
            `🔒 \`${key}\` revoked by <@${interaction.user.id}>${
              record.discord_user_id ? ` (was bound to <@${record.discord_user_id}>)` : ''
            }`
          )
        )
        .catch(() => {});
    }

    return interaction.editReply(
      `✅ Key \`${key}\` revoked.${roleRemoved ? ' Premium role removed from holder.' : ''}`
    );
  },
};
