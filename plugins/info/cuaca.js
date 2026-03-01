const axios = require("axios");

let wilayahCache = null;

/* ============================= */
/* LOAD DATA WILAYAH (CACHE)    */
/* ============================= */
async function loadWilayah() {
  if (wilayahCache) return wilayahCache;

  const { data } = await axios.get(
    "https://raw.githubusercontent.com/yusufsyaifudin/wilayah-indonesia/master/data/list_of_area/indonesia-region.min.json",
    { timeout: 20000 }
  );

  wilayahCache = data;
  return wilayahCache;
}

/* ============================= */
/* FORMAT ADM4 (WAJIB 10 DIGIT) */
/* ============================= */
function formatAdm4(id) {
  id = String(id).trim();

  if (!/^\d{10}$/.test(id)) {
    throw new Error("ID wilayah tidak valid: " + id);
  }

  return `${id.slice(0,2)}.${id.slice(2,4)}.${id.slice(4,6)}.${id.slice(6)}`;
}

/* ============================= */
/* CARI DESA EXACT MATCH DULU   */
/* ============================= */
async function cariWilayah(keyword) {
  const wilayah = await loadWilayah();
  keyword = keyword.toLowerCase();

  for (const prov of wilayah) {
    for (const kab of prov.regencies) {
      for (const kec of kab.districts) {
        for (const desa of kec.villages) {

          if (
            desa.name.toLowerCase() === keyword ||
            kec.name.toLowerCase() === keyword ||
            kab.name.toLowerCase().includes(keyword)
          ) {
            return {
              id: desa.id,
              desa: desa.name,
              kecamatan: kec.name,
              kabupaten: kab.name,
              provinsi: prov.name
            };
          }

        }
      }
    }
  }

  return null;
}

/* ============================= */
/* EXPORT PLUGIN                */
/* ============================= */
module.exports = {
  name: "Cek Cuaca",
  desc: "Menampilkan prakiraan cuaca BMKG berdasarkan nama wilayah",
  category: "Info",
  method: "GET",
  path: "/cuaca",
  params: [
    {
      name: "kota",
      type: "query",
      required: true,
      dtype: "string",
      desc: "Nama desa/kecamatan/kabupaten"
    }
  ],
  example: "/info/cuaca?kota=kemayoran",

  async run(req, res) {
    try {
      const { kota } = req.query;

      if (!kota) {
        return res.status(400).json({
          status: false,
          message: "Parameter 'kota' diperlukan",
        });
      }

      /* === CARI LOKASI === */
      const lokasi = await cariWilayah(kota);

      if (!lokasi) {
        return res.status(404).json({
          status: false,
          message: "Wilayah tidak ditemukan",
        });
      }

      /* === FORMAT ADM4 === */
      const adm4 = formatAdm4(lokasi.id);

      console.log("RAW ID:", lokasi.id);
      console.log("ADM4:", adm4);

      /* === REQUEST BMKG === */
      const { data } = await axios.get(
        `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`,
        { timeout: 15000 }
      );

      const prakiraan = data?.data?.[0]?.cuaca?.[0];

      if (!prakiraan || !prakiraan.length) {
        return res.status(404).json({
          status: false,
          message: "Data cuaca tidak tersedia",
        });
      }

      return res.status(200).json({
        status: true,
        creator: "Himejima",
        data: {
          lokasi: {
            desa: lokasi.desa,
            kecamatan: lokasi.kecamatan,
            kabupaten: lokasi.kabupaten,
            provinsi: lokasi.provinsi,
            adm4
          },
          prakiraan_hari_ini: prakiraan
        },
        metadata: {
          source: "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)",
          timestamp: new Date().toISOString(),
        },
      });

    } catch (err) {
      console.error("[Plugin Cuaca ERROR]", err.response?.data || err.message);

      return res.status(500).json({
        status: false,
        message: "Gagal mengambil data cuaca",
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
};