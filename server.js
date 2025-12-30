const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.set("trust proxy", 1);

app.use(cookieParser());

app.get("/", (req, res) => res.redirect("/main.html"));

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { visitors: {} };
  }
}

function saveData(data) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function ensureAnonId(req, res, next) {
  let anonId = req.cookies.anon_id;

  if (!anonId) {
    anonId = uuidv4();
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("anon_id", anonId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
  }

  const data = loadData();
  if (!data.visitors[anonId]) {
    data.visitors[anonId] = {
      digits: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveData(data);
  }

  req.anonId = anonId;
  next();
}

// Serve static files first. If static exists, it'll be served; otherwise fall through to route below.
app.use(express.static(path.join(__dirname, "public")));

// Single-digit route: matches 1-9. If a static file exists it was already served; here we handle fallback
// and visitor tracking.
app.get('/:digit([1-9])', ensureAnonId, (req, res) => {
  const d = req.params.digit;
  if (!/^[1-9]$/.test(d)) return res.status(400).send('digit must be 1~9.');

  const data = loadData();
  const row = data.visitors[req.anonId];
  row.digits += d;
  row.updated_at = new Date().toISOString();
  saveData(data);

  const digitFile = path.join(__dirname, 'public', `${d}.html`);
  fs.access(digitFile, fs.constants.R_OK, (err) => {
    if (!err) {
      return res.sendFile(digitFile);
    }

    // Static file missing => return generated HTML fallback
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${d}</title>
  <style>
    body { font-family: system-ui, -apple-system, Roboto, "Segoe UI", Arial; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f7fafc; }
    .card { text-align:center; padding:2rem; border-radius:8px; box-shadow:0 8px 30px rgba(2,6,23,0.08); background:#fff; }
    .digit { font-size:6rem; font-weight:700; }
  </style>
</head>
<body>
  <main class="card" role="main" aria-labelledby="title">
    <h1 id="title">${d}</h1>
    <div class="digit">${d}</div>
    <p>This is a generated fallback page for /${d} (static file not found).</p>
    <p><a href="/main.html">Back to main</a></p>
  </main>
</body>
</html>`;

    res.status(200).type('html').send(html);
  });
});

// Keep existing main.html/:digit behavior (updates and redirects)
app.get("/main.html/:digit", ensureAnonId, (req, res) => {
  const d = req.params.digit;
  if (!/^[1-9]$/.test(d)) return res.status(400).send("digit must be 1~9.");

  const data = loadData();
  const row = data.visitors[req.anonId];
  row.digits += d;
  row.updated_at = new Date().toISOString();
  saveData(data);

  res.redirect("/main.html");
});

// /me returns all visitors
app.get("/me", ensureAnonId, (req, res) => {
  const data = loadData();
  res.json({ anon_id: req.anonId, visitors: data.visitors });
});

// Fallback 404
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("running"));
