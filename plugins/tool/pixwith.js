const axios = require("axios");
const FormData = require("form-data");
const cheerio = require("cheerio");

const headers = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
  "Content-Type": "application/json",
  origin: "https://pixwith.ai",
  referer: "https://pixwith.ai/",
  "accept-language": "id-ID,id;q=0.9,en;q=0.8"
};

const models = {
  kling01image: {
    model_id: "1-34",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "auto", resolution: "1K" }
  },
  nanobanana: {
    model_id: "1-10",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "0" }
  },
  nanobanana2: {
    model_id: "1-23",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "0", resolution: "1K" }
  },
  flux2dev: {
    model_id: "1-28",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "0" }
  },
  seedream45: {
    model_id: "1-32",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "1:1", resolution: "2K" }
  },
  chatgpt15: {
    model_id: "1-37",
    options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: "1:1", quality: "low" }
  }
};

function gensesi() {
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s + "0";
}

function genmail() {
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += Math.floor(Math.random() * 36).toString(36);
  }
  return s + "@akunlama.com";
}

async function cekOtp(username) {
  const res = await axios.get(
    `https://akunlama.com/api/v1/mail/list?recipient=${username}`
  );

  if (res.data?.length) {
    const r = await axios.get(
      `https://akunlama.com/api/v1/mail/getHtml?region=${res.data[0].storage.region}&key=${res.data[0].storage.key}`
    );

    const $ = cheerio.load(r.data);
    $("script,style").remove();

    const match = $("body")
      .text()
      .replace(/\s+/g, " ")
      .match(/Verification code:\s*([A-Z0-9]+)/);

    return match ? match[1] : null;
  }

  return null;
}

async function pixwith(imgBuffer, prompt, modelName = "nanobanana", wait = true) {
  const modelConfig = models[modelName] || models.nanobanana;

  const tempSession = gensesi();
  const email = genmail();
  const username = email.split("@")[0];

  /* Request OTP */
  await axios.post(
    "https://api.pixwith.ai/api/user/send_email_code",
    { email },
    { headers: { ...headers, "x-session-token": tempSession } }
  );

  /* Wait OTP */
  let otp = null;
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 4000));
    otp = await cekOtp(username);
    if (otp) break;
  }

  if (!otp) throw new Error("OTP tidak diterima");

  /* Verify */
  const verifyRes = await axios.post(
    "https://api.pixwith.ai/api/user/verify_email_code",
    { email, code: otp },
    { headers: { ...headers, "x-session-token": tempSession } }
  );

  /* Firebase exchange */
  const ex = await axios.post(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyAoRsni0q79r831sDrUjUTynjAEG2ai-EY",
    {
      token: verifyRes.data.data.custom_token,
      returnSecureToken: true
    }
  );

  /* Get session */
  const user = await axios.post(
    "https://api.pixwith.ai/api/user/get_user",
    { token: ex.data.idToken, ref: "-1" },
    { headers: { ...headers, "x-session-token": tempSession } }
  );

  const sessionToken = user.data.data.session_token;

  /* Pre upload */
  const filename = `upload_${Date.now()}.jpg`;

  const pre = await axios.post(
    "https://api.pixwith.ai/api/chats/pre_url",
    { image_name: filename, content_type: "image/jpeg" },
    { headers: { ...headers, "x-session-token": sessionToken } }
  );

  const uploadData = pre.data.data;

  /* Upload file */
  const form = new FormData();
  Object.entries(uploadData.fields).forEach(([k, v]) => {
    form.append(k, v);
  });
  form.append("file", imgBuffer, filename);

  await axios.post(uploadData.url, form, {
    headers: form.getHeaders()
  });

  /* Create job */
  const create = await axios.post(
    "https://api.pixwith.ai/api/items/create",
    {
      images: { image1: uploadData.fields.key },
      prompt,
      options: modelConfig.options,
      model_id: modelConfig.model_id
    },
    { headers: { ...headers, "x-session-token": sessionToken } }
  );

  const jobId = create.data.data?.uid;

  if (!wait) {
    return {
      job_id: jobId,
      status: "processing"
    };
  }

  /* Polling result */
  let result;
  do {
    await new Promise(r => setTimeout(r, 4000));

    const history = await axios.post(
      "https://api.pixwith.ai/api/items/history",
      { tool_type: "1", tag: "", page: 0, page_size: 12 },
      { headers: { ...headers, "x-session-token": sessionToken } }
    );

    result = history.data.data.items[0];

  } while (!result || result.status !== 2);

  return {
    job_id: result.uid,
    image: result.result_urls.find(u => !u.is_input)?.hd,
    prompt: result.prompt,
    model: modelName
  };
}

module.exports = {
  name: "PixWith AI",
  desc: "Image to Image (pixwith.ai)",
  category: "Tools",
  method: "POST",
  path: "/tools/pixwith",

  run: async (req, res) => {
    const start = Date.now();

    try {
      const { prompt, model, wait } = req.body;

      if (!prompt) {
        return res.status(400).json({
          status: false,
          message: "Prompt wajib diisi"
        });
      }

      if (!req.files?.image) {
        return res.status(400).json({
          status: false,
          message: "Image file wajib dikirim"
        });
      }

      const imageBuffer = req.files.image.data;

      const result = await pixwith(
        imageBuffer,
        prompt,
        model,
        wait !== "false"
      );

      res.json({
        status: true,
        creator: "Himejima",
        data: {
          ...result,
          process_time: ((Date.now() - start) / 1000).toFixed(2) + "s"
        }
      });

    } catch (err) {
      console.error("[PIXWITH]", err.message);

      res.status(500).json({
        status: false,
        message: err.message
      });
    }
  }
};