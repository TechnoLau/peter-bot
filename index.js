require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// SERVER CONFIG
const guildConfig = new Map();

/*
STRUCT:
{
  afkChannelId,
  sourceChannels: [],
  timeout,
  enabled,
  excludedUsers: Set(userId),
  lastActive: Map(userId -> timestamp)
}
*/

function getCfg(guildId) {
  if (!guildConfig.has(guildId)) {
    guildConfig.set(guildId, {
      afkChannelId: null,
      sourceChannels: [],
      timeout: 300000,
      enabled: false,
      excludedUsers: new Set(),
      lastActive: new Map()
    });
  }
  return guildConfig.get(guildId);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// VOICE TRACKING
client.on("voiceStateUpdate", (oldState, newState) => {
  const cfg = getCfg(newState.guild.id);
  if (!cfg.enabled) return;

  const userId = newState.id;
  const now = Date.now();

  // ignore excluded users
  if (cfg.excludedUsers.has(userId)) return;

  const inSource = cfg.sourceChannels.includes(newState.channelId);

  if (inSource) {
    cfg.lastActive.set(userId, now);
  }
});

// CHECK LOOP
setInterval(async () => {
  for (const [guildId, cfg] of guildConfig.entries()) {
    if (!cfg.enabled || !cfg.afkChannelId) continue;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const afkChannel = guild.channels.cache.get(cfg.afkChannelId);
    if (!afkChannel) continue;

    const now = Date.now();

    for (const [userId, last] of cfg.lastActive.entries()) {
      if (cfg.excludedUsers.has(userId)) continue;

      if (now - last < cfg.timeout) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !member.voice.channel) continue;

      if (cfg.sourceChannels.includes(member.voice.channel.id)) {
        await member.voice.setChannel(afkChannel).catch(() => {});
      }
    }
  }
}, 10000);

// COMMANDS
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const cfg = getCfg(msg.guild.id);
  const args = msg.content.split(" ");
  const cmd = args[0];

  // SET AFK CHANNEL
  if (cmd === "!setafk") {
    const ch = msg.mentions.channels.first();
    if (!ch || ch.type !== ChannelType.GuildVoice) {
      return msg.reply("Mention a voice channel.");
    }
    cfg.afkChannelId = ch.id;
    return msg.reply("AFK channel set.");
  }

  // ADD SOURCE VC
  if (cmd === "!addvc") {
    const ch = msg.mentions.channels.first();
    if (!ch || ch.type !== ChannelType.GuildVoice) {
      return msg.reply("Mention a voice channel.");
    }
    if (!cfg.sourceChannels.includes(ch.id)) {
      cfg.sourceChannels.push(ch.id);
    }
    return msg.reply("Source VC added.");
  }

  // SET TIMEOUT
  if (cmd === "!timeout") {
    const sec = parseInt(args[1]);
    cfg.timeout = sec * 1000;
    return msg.reply(`Timeout set to ${sec}s`);
  }

  // ENABLE
  if (cmd === "!enable") {
    cfg.enabled = true;
    return msg.reply("Bot enabled.");
  }

  if (cmd === "!disable") {
    cfg.enabled = false;
    return msg.reply("Bot disabled.");
  }

  // EXCLUDE USER
  if (cmd === "!exclude") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user.");
    cfg.excludedUsers.add(user.id);
    return msg.reply(`${user.username} excluded from AFK system.`);
  }

  // INCLUDE USER
  if (cmd === "!include") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention a user.");
    cfg.excludedUsers.delete(user.id);
    return msg.reply(`${user.username} re-included.`);
  }

  // LIST EXCLUDED
  if (cmd === "!excluded") {
    if (cfg.excludedUsers.size === 0)
      return msg.reply("No excluded users.");

    return msg.reply(
      "Excluded: " +
        [...cfg.excludedUsers]
          .map(id => `<@${id}>`)
          .join(", ")
    );
  }
});

client.login(process.env.TOKEN);
