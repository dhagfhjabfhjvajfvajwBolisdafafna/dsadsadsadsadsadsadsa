require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, MessageFlags } = require('discord.js');
const { createApiServer } = require('./api');
const { startExpiryJob } = require('./expiryJob');

const REQUIRED_ENV = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'GUILD_ID',
  'ADMIN_ROLE_ID',
  'PREMIUM_ROLE_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VALIDATION_API_KEY',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startExpiryJob(client);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: '❌ Something went wrong running that command.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Express validation API runs in the same process, on its own port.
const app = createApiServer();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Validation API listening on port ${port}`);
});

// Basic process-level safety nets so an unhandled error doesn't kill
// the always-on host silently.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
