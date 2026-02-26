const Genius = require("genius-lyrics");

const Client = new Genius.Client(); 
// Bisa isi token kalau punya:
// const Client = new Genius.Client("GENIUS_ACCESS_TOKEN");

module.exports = {
  name: "Lyrics",
  desc: "Cari lirik lagu (Genius)",
  category: "Search",
  method: "GET",
  path: "/lyrics",

  params: [
    {
      name: "query",
      type: "query",
      required: true,
      dtype: "string",
      desc: "Judul lagu / artis"
    }
  ],

  example: "/search/lyrics?query=rap+god",

  run: async (req, res) => {
    try {
      let { query } = req.query;

      if (!query || !query.trim()) {
        return res.status(400).json({
          status: false,
          message: "Parameter query wajib diisi"
        });
      }

      query = query.trim();

      const searches = await Client.songs.search(query);

      if (!searches.length) {
        return res.status(404).json({
          status: false,
          message: `Lagu "${query}" tidak ditemukan`
        });
      }

      const song = searches[0];
      const lyrics = await song.lyrics();

      if (!lyrics || !lyrics.trim()) {
        return res.status(404).json({
          status: false,
          message: `Lirik "${query}" tidak ditemukan`
        });
      }

      const safeLyrics =
        lyrics.length > 4000
          ? lyrics.slice(0, 4000) + "\n\n..."
          : lyrics;

      res.json({
        status: true,
        creator: "Himejima",
        data: {
          title: song.title,
          artist: song.artist?.name,
          lyrics: safeLyrics,
        }
      });

    } catch (err) {
      console.error("[GENIUS LYRICS]", err.message);

      res.status(500).json({
        status: false,
        message: err.message
      });
    }
  }
};