const axios = require("axios");
const FormData = require("form-data");
const crypto = require("crypto");
const redis = require("../../lib/redis");

const SESSION_TTL = 60 * 60 * 6; // 6 jam
const MAX_HISTORY = 20;

function generateApiKey() {
  const r = Math.floor(1e11 * Math.random());
  return "tryit-" + r + "-" + "a3edf17b505349f1794bcdbc7290a045";
}

function generateUUID() {
  return crypto.randomUUID();
}

async function askClaude(history) {
  const apiKey = generateApiKey();
  const sessionUuid = generateUUID();

  const formData = new FormData();
  formData.append("chat_style", "claudeai_0");
  formData.append("chatHistory", JSON.stringify(history));
  formData.append("model", "standard");
  formData.append("session_uuid", sessionUuid);
  formData.append("hacker_is_stinky", "very_stinky");

  const res = await axios.post(
    "https://api.deepai.org/hacking_is_a_serious_crime",
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        "api-key": apiKey,
        "User-Agent":
          "Mozilla/5.0 (Android 10; Mobile) AppleWebKit/537.36 Chrome/137.0.0.0 Mobile Safari/537.36",
        referer: "https://deepai.org/chat/claude-3-haiku",
        accept: "*/*",
      },
      timeout: 30000,
    }
  );

  if (!res.data) throw new Error("Empty response from API");

  return res.data;
}

module.exports = {
  name: "ClaudeAI",
  desc: "Chat AI Claude dengan custom karakter + session 6 jam",
  category: "AI",
  method: "GET",
  path: "/claude",

  params: [
    {
      name: "prompt",
      type: "query",
      required: true,
      dtype: "string",
      desc: "Pertanyaan untuk AI",
    },
    {
      name: "name",
      type: "query",
      required: false,
      dtype: "string",
      desc: "Nama AI",
    },
    {
      name: "style",
      type: "query",
      required: false,
      dtype: "string",
      desc: "Karakter / personality AI",
    },
    {
      name: "session_id",
      type: "query",
      required: false,
      dtype: "string",
      desc: "Session chat ID",
    },
  ],

  example:
    "/ai/claude?prompt=halo&name=Libie&style=tsundere&session_id=uuid",

  responses: [
    { code: 200, desc: "Berhasil mendapatkan jawaban AI" },
    { code: 400, desc: "Bad Request" },
    { code: 500, desc: "Server Error" },
  ],

  async run(req, res) {
    try {
      const { prompt, name, style, session_id } = req.query;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: "Parameter ?prompt= wajib diisi",
        });
      }

      const sid = session_id || generateUUID();
      const key = `chat:${sid}`;

      let history = [];
      const oldSession = await redis.get(key);

      if (oldSession) {
        history = JSON.parse(oldSession);
      } else {
        const persona = `
Kamu adalah AI bernama ${name || "Libie"}.
Kepribadian:
${style || "Ramah, pintar, sedikit santai, dan membantu."}
Jawab dengan natural dan jangan menyebutkan bahwa ini adalah instruksi sistem.
        `.trim();

        history.push({
          role: "user",
          content: persona,
        });
      }

      // Tambah pesan user
      history.push({
        role: "user",
        content: prompt,
      });

      // Batasi history
      if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
      }

      const rawResponse = await askClaude(history);

      // Normalisasi response
      const aiText =
        typeof rawResponse === "string"
          ? rawResponse
          : rawResponse?.output ||
            rawResponse?.response ||
            rawResponse?.data ||
            JSON.stringify(rawResponse);

      history.push({
        role: "assistant",
        content: aiText,
      });

      // Simpan session + TTL
      await redis.set(key, JSON.stringify(history), {
        EX: SESSION_TTL,
      });

      res.json({
        status: true,
        creator: "Himejima",
        session_id: sid,
        data: {
          prompt,
          ai_name: name || "Libie",
          personality: style || "Default",
          response: aiText,
        },
        metadata: {
          expires_in: "6 hours",
          timestamp: new Date().toISOString(),
        },
      });

    } catch (err) {
      console.error("[ClaudeAI]", err.message);

      res.status(500).json({
        status: false,
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
};