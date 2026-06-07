// deploy-commands.js
// Run this once (or whenever you add/change commands): node deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const files = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));

for (const file of files) {
  const mod = await import(pathToFileURL(join(__dirname, 'commands', file)));
  if (mod.data) commands.push(mod.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

console.log(`🚀 Deploying ${commands.length} slash commands to guild ${process.env.GUILD_ID}...`);

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
);

console.log('✅ Commands deployed!');
