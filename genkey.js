const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { supabase } = require('../supabase');
const { generateKey, parseDuration } = require('../keygen');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('genkey')
    .setDescription('Generate one or more Focuss Tweaks license keys (admin only)')
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('e.g. 7d, 30d, or lifetime')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('How many keys to generate (default 1)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('note')
        .setDescription('Optional label for these keys (e.g. "giveaway batch")')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('tier')
        .setDescription('Tier of the license: basic or premium (default basic)')
        .addChoices(
          { name: 'Basic', value: 'basic' },
          { name: 'Premium', value: 'premium' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({
        content: '❌ You do not have permission to run this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const durationInput = interaction.options.getString('duration', true);
    const amount = interaction.options.getInteger('amount') ?? 1;
    const note = interaction.options.getString('note');
    const tier = interaction.options.getString('tier') ?? 'basic';

    let durationDays;
    try {
      ({ durationDays } = parseDuration(durationInput));
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rows = Array.from({ length: amount }, () => ({
      key_code: generateKey(),
      status: 'unused',
      duration_days: durationDays,
      note: note || null,
      tier: tier,
      created_by: interaction.user.id,
    }));

    const { data, error } = await supabase.from('license_keys').insert(rows).select('key_code');

    if (error) {
      console.error('[genkey] insert error:', error);
      return interaction.editReply('❌ Failed to generate keys. Check server logs.');
    }

    const label = durationDays === null ? 'lifetime' : `${durationDays}d`;
    const keyList = data.map((r) => `\`${r.key_code}\``).join('\n');

    return interaction.editReply(
      `✅ Generated ${data.length} **${tier.toUpperCase()}** key(s) (${label})${note ? ` — note: ${note}` : ''}\n\n${keyList}`
    );
  },
};
