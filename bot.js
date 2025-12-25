const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} = require("@discordjs/voice");
const { spawn } = require("child_process");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const PREFIX = "!";
const servers = new Map();

/* ========== เรียก Python ========== */
function callPython(url) {
  return new Promise((resolve) => {
    const py = spawn("python", ["worker.py", url]);
    let data = "";

    py.stdout.on("data", (d) => (data += d));

    py.on("close", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ status: "error" });
      }
    });
  });
}

/* ========== เล่นเพลงถัดไป (ใช้ ffmpeg) ========== */
async function playNext(guildId) {
  const server = servers.get(guildId);
  if (!server || server.queue.length === 0) {
    server?.connection.destroy();
    servers.delete(guildId);
    return;
  }

  const item = server.queue.shift();
  const res = await callPython(item.url);

  if (res.status !== "ok") {
    server.text.send("❌ เล่นคลิปนี้ไม่ได้ ข้ามให้อัตโนมัติ");
    return playNext(guildId);
  }

  // 🔥 ffmpeg = ตัวทำให้ “ดังแน่นอน”
  const ffmpeg = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", res.stream,
    "-analyzeduration", "0",
    "-loglevel", "0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ]);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  server.player.play(resource);
  server.text.send(`▶️ **กำลังเล่น:** ${res.title}`);
}

/* ========== Discord ========== */
client.once("clientReady", () => {
  console.log(`🤖 Online: ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(1).trim().split(" ");
  const cmd = args.shift();

  /* ===== help (ไม่ join VC) ===== */
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

  /* ===== คำสั่งที่ต้องอยู่ใน VC ===== */
  const vc = msg.member.voice.channel;
  if (!vc) return msg.reply("❌ กรุณาเข้า Voice Channel ก่อน");

  let server = servers.get(msg.guild.id);

  /* ===== play ===== */
  if (cmd === "play") {
    const url = args[0];
    if (!url) return msg.reply("❌ กรุณาใส่ลิงก์");

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

      player.on(AudioPlayerStatus.Idle, () => {
        playNext(msg.guild.id);
      });

      servers.set(msg.guild.id, server);
    }

    server.queue.push({ url });
    msg.reply("▶️ เพิ่มคลิปเข้า Queue แล้ว");

    if (server.player.state.status !== AudioPlayerStatus.Playing) {
      playNext(msg.guild.id);
    }
    return;
  }

  /* ===== ต้องมีเพลงก่อน ===== */
  if (!server) return msg.reply("❌ ยังไม่มีเพลง ใช้ !play ก่อน");

  if (cmd === "pause") {
    server.player.pause();
    return msg.reply("⏸️ พักเสียงแล้ว");
  }

  if (cmd === "resume") {
    server.player.unpause();
    return msg.reply("▶️ เล่นต่อแล้ว");
  }

  if (cmd === "skip") {
    server.player.stop();
    return msg.reply("⏭️ ข้ามคลิป");
  }

  if (cmd === "stop") {
    server.queue = [];
    server.player.stop();
    server.connection.destroy();
    servers.delete(msg.guild.id);
    return msg.reply("⏹️ หยุดทั้งหมดแล้ว");
  }

  if (cmd === "queue") {
    if (server.queue.length === 0)
      return msg.reply("📭 ไม่มีคลิปใน Queue");

    return msg.reply(
      "📜 **Queue:**\n" +
        server.queue.map((q, i) => `${i + 1}. ${q.url}`).join("\n")
    );
  }
});

require('dotenv').config();

client.login(process.env.DISCORD_TOKEN);
