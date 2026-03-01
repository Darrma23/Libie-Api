const pkg = require('./package.json');
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const os = require('os');
const { execSync } = require('child_process');

const { ipLimiter, getIP, LIMIT } = require('./lib/iplimiter');
const redis = require('./lib/redis');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.set('json spaces', 2);

const CREATOR = "Himejima";

function clean(str) {
  return String(str || '')
    .replace(/[<>"']/g, '')
    .trim();
}

const CATEGORY_PREFIX = {
  downloader: '/download',
  anime: '/anime',
  ai: '/ai',
  tools: '/tools',
  info: '/info'
};

function resolvePrefix(category) {
  return CATEGORY_PREFIX[String(category).toLowerCase()] || '/other';
}

/* ================= GLOBAL MIDDLEWARE ================= */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status:false, message:'Terlalu banyak request' }
});

app.use('/', limiter);
let pluginRouter = express.Router();
app.use('/api', async (req, res, next) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);

    await redis.incr('stats:hits:all');
    await redis.incr(`stats:hits:day:${todayKey}`);

  } catch (err) {
    console.error('Hit counter error:', err.message);
  }

  next();
});
app.use(ipLimiter);
app.use('/api', pluginRouter);

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname,'public')));

/* ================= CREATOR INJECTION ================= */

app.use((req, res, next) => {
  const originalJson = res.json;

  res.json = function (body) {
    if (typeof body === 'object' && body !== null) {
      body.creator = CREATOR;
    }
    return originalJson.call(this, body);
  };

  next();
});

/* ================= LOAD PLUGINS ================= */

function loadPlugins() {

  pluginRouter.stack = []; // reset route lama

  const pluginsDir = path.join(__dirname, 'plugins');
  const apiList = [];
  let registeredCount = 0;

  if (!fs.existsSync(pluginsDir)) {
    global.apiList = [];
    return { count: 0, list: [] };
  }

  const categories = fs.readdirSync(pluginsDir).filter(file =>
    fs.statSync(path.join(pluginsDir, file)).isDirectory()
  );

  categories.forEach(category => {

    const categoryPath = path.join(pluginsDir, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

    files.forEach(file => {

      const filePath = path.join(categoryPath, file);
      delete require.cache[require.resolve(filePath)];

      let plugin;
      try {
        plugin = require(filePath);
      } catch (err) {
        console.error(`✖ Gagal load ${file}:`, err.message);
        return;
      }

      if (!plugin.name || !plugin.method || !plugin.path || typeof plugin.run !== 'function') {
        console.error(`✖ Plugin ${file} tidak valid`);
        return;
      }

      const method = plugin.method.toLowerCase();
      const basePath = plugin.path.startsWith('/') ? plugin.path : '/' + plugin.path;

      const prefix = resolvePrefix(plugin.category || category);
      const fullPath = `${prefix}${basePath}`.replace(/\/+/g, '/');

      pluginRouter[method](fullPath, async (req, res) => {
        try {
          await plugin.run(req, res);
        } catch (err) {
          res.status(500).json({
            status: false,
            message: err.message
          });
        }
      });

      registeredCount++;

      const normalizedParams = Array.isArray(plugin.params)
        ? plugin.params.map(p => {
            return {
              nama: p.nama || p.name || '',
              tipe: p.tipe || p.type || 'query',
              required: p.required ?? true,
              dtype: p.dtype || 'string',
              desc: p.desc || ''
            };
          })
        : [];
      
      apiList.push({
        nama: plugin.name,
        deskripsi: plugin.desc,
        kategori: plugin.category || category,
        method: plugin.method.toUpperCase(),
        endpoint: `/api${fullPath}`,
        parameter: normalizedParams,
        contoh: plugin.example || ''
      });

      console.log(`✔ ${method.toUpperCase()} /api${fullPath}`);
    });
  });

  global.apiList = apiList;
  return { count: registeredCount, list: apiList };
}

/* ================= INIT ================= */

let { count, list: apiList } = loadPlugins();

/* ================= WATCHER ================= */

fs.watch(path.join(__dirname, 'plugins'), { recursive: true }, (event, filename) => {
  if (!filename || !filename.endsWith('.js')) return;
  console.log('♻ Reload plugin...');
  const result = loadPlugins();
  count = result.count;
  apiList = result.list;
});

/* ================= API INFO ================= */

app.get('/api/info', (req, res) => {
  try {
    res.status(200).json({
      status: true,
      server: "LIBIE API",
      version: pkg.version,
      total_endpoints: apiList.length,
      endpoint_categories: [...new Set(apiList.map(api => api.kategori))],
      apis: apiList
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

/* ================= HEALTH ================= */

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: true,
    message: 'Server healthy',
    uptime: process.uptime(),
    total_plugins: count,
    timestamp: new Date().toISOString()
  });
});

/* ================= PING ================= */

app.get('/api/ping', (req, res) => {
  res.status(200).json({
    status: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

/* ================= STATUS IP ================= */

app.get('/api/status/ip', async (req,res) => {
  try {
    const ip = getIP(req);
    const key = `quota:${ip}`;

    const requests = Number(await redis.get(key)) || 0;
    const ttl = await redis.ttl(key);

    res.json({
     status: true,
     creator: CREATOR,
     ip,
     requests,
     remaining: Math.max(0, LIMIT - requests),
     blocked: requests >= LIMIT,
     reset_at: ttl > 0 ? new Date(Date.now() + ttl * 1000) : null,
     endpoints_used: requests
   });

  } catch (err) {
    console.error('Quota read error:', err.message);

    res.status(500).json({
      status:false,
      message:'Gagal membaca quota'
    });
  }
});

/* ================= USER REPORT ================= */
app.post('/api/user-report', async (req, res) => {
  try {
    const ip = getIP(req);
    const { type, message, timestamp } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: false,
        error: 'Pesan laporan kosong'
      });
    }

    const cleanType = clean(type || 'other');
    const cleanMsg  = clean(message);
    const time = timestamp || new Date().toISOString();

    const key = `report:${Date.now()}`;

    await redis.hSet(key, {
     ip,
     type: cleanType,
     message: cleanMsg,
     timestamp: time
   });
   
   await redis.expire(key, 60 * 60 * 24 * 7);
   
   await redis.publish("reports", JSON.stringify({
     ip,
     type: cleanType,
     message: cleanMsg,
     timestamp: time
   }));
   
   console.log(`📩 REPORT ${cleanType.toUpperCase()} dari ${ip}`);
   
   res.json({
     status: true,
     message: 'Laporan diterima'
   });

  } catch (err) {
    console.error('🔥 Report error:', err.message);

    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

/* ================= STATUS API ================= */
app.get('/api/stats', async (req, res) => {
  const start = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  
  try {
    const exec = (cmd) => {
      try { return execSync(cmd).toString().trim(); }
      catch { return "N/A"; }
    };

    /* ================= SYSTEM ================= */
    const load = os.loadavg();
    const cores = os.cpus().length;

    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;

    const diskRaw = exec("df -h / | tail -1").split(/\s+/);

    /* ================= API STATS ================= */
    const totalReports = (await redis.keys('report:*')).length;
    const totalUsers   = (await redis.keys('quota:*')).length;
    const totalHitsAll = Number(await redis.get('stats:hits:all')) || 0;
    const totalHitsToday =Number(await redis.get(`stats:hits:day:${todayKey}`)) || 0;

    const cpuUsage = ((load[0] / cores) * 100);
    const memUsage = ((memUsed / memTotal) * 100);

    /* ================= WARNINGS ================= */
    const warnings = [];

    if (cpuUsage > 90)
      warnings.push("CRITICAL: CPU overload");

    if (memUsage > 85)
      warnings.push("WARNING: High memory usage");

    res.json({
      status: true,

      server: {
        os: exec("lsb_release -ds || uname -o"),
        kernel: os.release(),
        arch: os.arch(),
        platform: os.platform(),
        hostname: os.hostname(),
        uptime: exec("uptime -p"),

        cpu: {
          model: os.cpus()[0]?.model,
          cores,
          load_1m: load[0],
          load_5m: load[1],
          load_15m: load[2],
          usage_percent: cpuUsage.toFixed(2)
        },

        memory: {
          total_gb: (memTotal / 1024 / 1024 / 1024).toFixed(2),
          used_gb: (memUsed / 1024 / 1024 / 1024).toFixed(2),
          free_gb: (memFree / 1024 / 1024 / 1024).toFixed(2),
          usage_percent: memUsage.toFixed(2)
        },

        disk: {
          total: diskRaw[1] || "N/A",
          used: diskRaw[2] || "N/A",
          free: diskRaw[3] || "N/A",
          percent: diskRaw[4] || "N/A"
        }
      },

      api: {
        total_endpoints: apiList.length,
        active_users: totalUsers,
        total_reports: totalReports,
        total_hits_today: totalHitsToday,
        total_hits_all: totalHitsAll
      },

      process: {
        node_version: process.version,
        rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(2)
      },

      warnings,
      collection_time_ms: Date.now() - start,
      generated_at: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      message: err.message
    });
  }
});

/* ================= RUN NOTIFY ================= */
app.post('/api/run-notify', async (req, res) => {
  try {
    const { endpoint, method, status, ms, url } = req.body;
    const ip = getIP(req);

    console.log(`🧪 TRY ${method} ${endpoint} → ${status} (${ms}ms) dari ${ip}`);

    res.json({ status: true });

  } catch (err) {
    console.error('Run notify error:', err.message);
    res.status(500).json({ status:false });
  }
});

/* ================= FRONTEND ================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/server', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'server.html'));
});

/* ================= 404 HANDLER ================= */

app.use((req, res) => {
  const acceptsHTML = req.headers.accept?.includes('text/html');

  if (acceptsHTML) {
    return res.status(404).sendFile(
      path.join(__dirname, 'public', '404.html')
    );
  }

  res.status(404).json({
    status: false,
    message: 'Endpoint tidak ditemukan',
    requested_url: req.originalUrl,
    method: req.method,
    available_endpoints: '/api/info'
  });
});

/* ================= ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error('🔥 Global Error:', err.stack);

  res.status(500).json({
    status: false,
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

/* ================= START ================= */

app.listen(PORT, "0.0.0.0", async () => {
  console.log('\n==============================');
  console.log('🚀 LIBIE API STARTED');
  console.log('==============================');

  console.log(`🌐 URL          : http://localhost:${PORT}`);
  console.log(`📚 Docs UI      : http://localhost:${PORT}`);
  console.log(`🔍 API Info     : http://localhost:${PORT}/api/info`);
  console.log(`🏓 Ping         : http://localhost:${PORT}/api/ping`);

  console.log('------------------------------');
  console.log(`📊 Total Plugin : ${count}`);
  console.log(`🧩 Categories   : ${[...new Set(apiList.map(a => a.kategori))].join(', ')}`);

  try {
    const pong = await redis.ping();
    console.log(`🟥 Redis        : ${pong}`);
  } catch (err) {
    console.log(`🟥 Redis        : OFFLINE (${err.message})`);
  }

  console.log('------------------------------');
  console.log(`⚙️  Mode        : ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱ Uptime       : ${process.uptime().toFixed(2)}s`);
  console.log(`🧠 Memory       : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`);
  console.log('==============================\n');
});