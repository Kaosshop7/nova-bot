/* ========== Imports & Client Setup ========== */
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  AudioPlayerStatus, 
  createAudioPlayer, 
  createAudioResource, 
  joinVoiceChannel, 
  StreamType 
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = "!";
const servers = new Map();

/* ========== เล่นเพลงถัดไป ========== */
async function playNext(guildId) {
  const server = servers.get(guildId);
  if (!server || server.queue.length === 0) {
    server?.connection.destroy();
    servers.delete(guildId);
    return;
  }

  const item = server.queue.shift();

  try {
    const stream = ytdl(item.url, { filter: 'audioonly' });
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });

    server.player.play(resource);

    server.player.once('idle', () => playNext(guildId));

    server.text.send(`▶️ **กำลังเล่น:** ${item.url}`);
  } catch (err) {
    server.text.send("❌ เล่นคลิปนี้ไม่ได้ ข้ามให้อัตโนมัติ");
    playNext(guildId);
  }
}

/* ========== Discord Events ========== */
client.once("clientReady", () => {
  console.log(`🤖 Online: ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(" ");
  const cmd = args.shift().toLowerCase();

  /* ===== !help ===== */
  if (cmd === "help") {
    return msg.reply(`
📖 **คู่มือบอทเสียง**

🎧 วิธีใช้งาน
• บอทจะเข้า Voice Channel เฉพาะตอนใช้ \`!play\`

🕹️ คำสั่ง
• \`!play <ลิงก์>\` → เข้า VC และเล่นเสียง
• \`!pause\`
• \`!resume\`
• \`!skip\`
• \`!stop\`
• \`!queue\`
• \`!help\`
`);
  }

  const vc = msg.member.voice.channel;
  let server = servers.get(msg.guild.id);

  /* ===== !play ===== */
  if (cmd === "play") {
    if (!vc) return msg.reply("❌ กรุณาเข้า Voice Channel ก่อน");
    const url = args[0];
    if (!url) return msg.reply("❌ กรุณาใส่ลิงก์ YouTube");

    if (!server) {
      const connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: msg.guild.id,
        adapterCreator: msg.guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer();
      connection.subscribe(player);

      server = {
        connection,
        player,
        queue: [],
        text: msg.channel,
      };

      player.on(AudioPlayerStatus.Idle, () => playNext(msg.guild.id));
      servers.set(msg.guild.id, server);
    }

    server.queue.push({ url });
    msg.reply(`▶️ เพิ่มคลิปเข้า Queue: ${url}`);

    if (server.player.state.status !== AudioPlayerStatus.Playing) {
      playNext(msg.guild.id);
    }
    return;
  }

  if (!server) return msg.reply("❌ ยังไม่มีเพลง ใช้ !play ก่อน");

  /* ===== !pause ===== */
  if (cmd === "pause") {
    server.player.pause();
    return msg.reply("⏸️ พักเสียงแล้ว");
  }

  /* ===== !resume ===== */
  if (cmd === "resume") {
    server.player.unpause();
    return msg.reply("▶️ เล่นต่อแล้ว");
  }

  /* ===== !skip ===== */
  if (cmd === "skip") {
    server.player.stop();
    return msg.reply("⏭️ ข้ามคลิป");
  }

  /* ===== !stop ===== */
  if (cmd === "stop") {
    server.queue = [];
    server.player.stop();
    server.connection.destroy();
    servers.delete(msg.guild.id);
    return msg.reply("⏹️ หยุดทั้งหมดแล้ว");
  }

  /* ===== !queue ===== */
  if (cmd === "queue") {
    if (server.queue.length === 0) return msg.reply("📭 ไม่มีคลิปใน Queue");
    return msg.reply(
      "📜 **Queue:**\n" +
        server.queue.map((q, i) => `${i + 1}. ${q.url}`).join("\n")
    );
  }
});

/* ===== Login ===== */
client.login(process.env.DISCORD_TOKEN);
