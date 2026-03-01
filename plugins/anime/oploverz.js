const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://oploverz.ch";
const GOFILE_WEBSITE_TOKEN = "4fd6sg89d7s6";

let gofileToken = null;

const http = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0",
    Referer: BASE + "/",
  },
});

const abs = (href) => {
  if (!href) return null;
  return href.startsWith("http")
    ? href
    : BASE + (href.startsWith("/") ? "" : "/") + href;
};

async function fetchHTML(url) {
  const res = await http.get(url);
  return cheerio.load(res.data);
}

async function getGofileToken() {
  if (gofileToken) return gofileToken;

  const res = await axios.post(
    "https://api.gofile.io/accounts",
    {},
    { timeout: 10000 }
  );

  if (res.data?.status !== "ok")
    throw new Error("Gagal mendapatkan token gofile");

  gofileToken = res.data.data.token;
  return gofileToken;
}

async function bypassGofile(url) {
  const id = url.match(/gofile\.io\/d\/([a-zA-Z0-9]+)/)?.[1];
  if (!id) throw new Error("ID gofile tidak ditemukan");

  const token = await getGofileToken();

  const res = await axios.get(
    `https://api.gofile.io/contents/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-website-token": GOFILE_WEBSITE_TOKEN,
      },
    }
  );

  if (res.data?.status !== "ok")
    throw new Error("Gofile API error");

  const files = Object.values(res.data.data.children || {})
    .filter(v => v.type === "file")
    .map(v => ({
      name: v.name,
      size: v.size,
      link: v.link,
      md5: v.md5,
    }));

  return {
    folder: res.data.data.name,
    files,
  };
}

function parseCards($) {
  const results = [];

  $("article.bs").each((_, el) => {
    const a = $(el).find("a").first();
    const link = abs(a.attr("href"));
    const img = $(el).find("img").first();
    const title =
      img.attr("title") ||
      img.attr("alt") ||
      $(el).find("h2").text().trim();

    if (title && link)
      results.push({
        title,
        link,
        image: img.attr("src") || img.attr("data-src"),
      });
  });

  return results;
}

async function searchAnime(q) {
  const $ = await fetchHTML(`/?s=${encodeURIComponent(q)}`);
  return parseCards($);
}

async function getLatest() {
  const $ = await fetchHTML("/");
  return parseCards($);
}

async function getDetail(url) {
  const $ = await fetchHTML(url);

  return {
    title: $("h1").first().text().trim(),
    cover: $(".thumb img").first().attr("src"),
    synopsis: $(".entry-content p").first().text().trim(),
  };
}

async function getDownload(url) {
  const $ = await fetchHTML(url);
  const links = {};

  $("a").each((_, a) => {
    const href = ($(a).attr("href") || "").trim();
    if (href.startsWith("http"))
      links[$(a).text().trim() || "Download"] = href;
  });

  return links;
}

module.exports = {
  name: "Oploverz",
  desc: "Scraper anime dari oploverz + bypass gofile",
  category: "Anime",
  method: "GET",
  path: "/oploverz",
  params: [
    { nama: "action", tipe: "query", required: true, desc: "search | latest | detail | download | bypass" },
    { nama: "q", tipe: "query", required: false, desc: "Query pencarian" },
    { nama: "url", tipe: "query", required: false, desc: "URL detail/download/gofile" }
  ],
  example: "/anime/oploverz?action=search&q=naruto",

  async run(req, res) {
    try {
      const { action, q, url } = req.query;

      if (!action)
        return res.status(400).json({
          status: false,
          message: "Parameter action wajib diisi",
        });

      let result;

      switch (action) {
        case "search":
          if (!q) throw new Error("Parameter q diperlukan");
          result = await searchAnime(q);
          break;

        case "latest":
          result = await getLatest();
          break;

        case "detail":
          if (!url) throw new Error("Parameter url diperlukan");
          result = await getDetail(url);
          break;

        case "download":
          if (!url) throw new Error("Parameter url diperlukan");
          result = await getDownload(url);
          break;

        case "bypass":
          if (!url) throw new Error("Parameter url diperlukan");
          result = await bypassGofile(url);
          break;

        default:
          throw new Error("Action tidak valid");
      }

      res.json({
        status: true,
        creator: "Himejima",
        action,
        result,
      });

    } catch (err) {
      res.status(500).json({
        status: false,
        message: err.message,
      });
    }
  },
};