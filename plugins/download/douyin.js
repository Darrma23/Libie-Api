const axios = require("axios");
const { createHash } = require("crypto");

const BASE = "https://api.seekin.ai/ikool/media/download";
const SECRET = "3HT8hjE79L";

function sortAndStringify(obj) {
  if (!obj || typeof obj !== "object") return "";
  return Object.keys(obj)
    .sort()
    .map(k => `${k}=${obj[k]}`)
    .join("&");
}

function generateSign(lang, timestamp, body = {}) {
  const raw = `${lang}${timestamp}${SECRET}${sortAndStringify(body)}`;
  return createHash("sha256").update(raw).digest("hex");
}

function buildHeaders(body = {}) {
  const lang = "en";
  const timestamp = Date.now().toString();
  const sign = generateSign(lang, timestamp, body);

  return {
    accept: "*/*",
    "content-type": "application/json",
    lang,
    origin: "https://www.seekin.ai",
    referer: "https://www.seekin.ai/",
    "user-agent": "Mozilla/5.0",
    sign,
    timestamp
  };
}

module.exports = {
  name: "Douyin Downloader",
  desc: "Download video Douyin via seekin.ai",
  category: "Downloader",
  method: "GET",
  path: "/douyin",

  params: [
    {
      name: "url",
      type: "query",
      required: true,
      desc: "Link video Douyin"
    }
  ],

  example: "/downloader/douyin?url=https://v.douyin.com/9JlALRyHj4/",

  async run(req, res) {
    try {
      const { url } = req.query;

      if (!url) {
        return res.status(400).json({
          status: false,
          message: "Parameter url wajib diisi"
        });
      }

      if (!/^https?:\/\//.test(url)) {
        return res.status(400).json({
          status: false,
          message: "URL tidak valid"
        });
      }

      const body = { url };

      const response = await axios.post(BASE, body, {
        headers: buildHeaders(body),
        timeout: 30000
      });

      const { msg, data } = response.data || {};

      if (!data) {
        return res.status(500).json({
          status: false,
          message: "Gagal mengambil data dari seekin.ai"
        });
      }

      return res.json({
        status: true,
        creator: "Himejima",
        result: {
          message: msg || "OK",
          title: data.title || null,
          thumbnail: data.imageUrl || null,
          video: data.medias?.[0]?.url || null
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        message: err.response?.data?.msg || err.message
      });
    }
  }
};