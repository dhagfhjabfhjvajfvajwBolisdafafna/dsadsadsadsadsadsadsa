const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banuser')
    .setDescription('Ban a user from redeeming keys and revoke their existing ones (admin only)')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to ban').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the ban').setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({
        content: '❌ You do not have permission to run this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { error: banError } = await supabase.from('banned_users').upsert({
      discord_user_id: targetUser.id,
      banned_by: interaction.user.id,
      reason,
      banned_at: new Date().toISOString(),
    });

    if (banError) {
      console.error('[banuser] ban insert error:', banError);
      return interaction.editReply('❌ Failed to ban user.');
    }

    // Revoke all keys bound to this user.
    const { data: revokedKeys, error: revokeError } = await supabase
      .from('license_keys')
      .update({ status: 'revoked' })
      .eq('discord_user_id', targetUser.id)
      .neq('status', 'revoked')
      .select('key_code');

    if (revokeError) {
      console.error('[banuser] revoke error:', revokeError);
    }

    // Remove Premium role if the member is still in the guild.
    let roleRemoved = false;
    try {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (member.roles.cache.has(process.env.PREMIUM_ROLE_ID)) {
        await member.roles.remove(process.env.PREMIUM_ROLE_ID);
        roleRemoved = true;
      }
    } catch {
      // Not in server; nothing to remove.
    }

    if (process.env.LOG_CHANNEL_ID) {
      interaction.client.channels
        .fetch(process.env.LOG_CHANNEL_ID)
        .then((ch) =>
          ch.send(
            `🚫 <@${targetUser.id}> banned by <@${interaction.user.id}>${
              reason ? ` — reason: ${reason}` : ''
            }. ${revokedKeys?.length || 0} key(s) revoked.`
          )
        )
        .catch(() => {});
    }

    return interaction.editReply(
      `✅ Banned <@${targetUser.id}>. Revoked ${revokedKeys?.length || 0} key(s).${
        roleRemoved ? ' Premium role removed.' : ''
      }`
    );
  },
};
