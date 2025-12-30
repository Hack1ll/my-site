const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.set("trust proxy", 1); // 배포 프록시 환경 대응

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

// 파일 깨짐 방지: tmp -> rename
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

// --- SINGLE-DIGIT ROUTE ---
// Register BEFORE static middleware so /1 won't fall through to static 404.
// Only match single digits 1~9 to avoid collisions with other routes.
app.get("/:digit([1-9])", ensureAnonId, (req, res) => {
  const d = req.params.digit;
  if (!/^[1-9]$/.test(d)) return res.status(400).send("digit must be 1~9.");

  const data = loadData();
  const row = data.visitors[req.anonId];
  row.digits += d;
  row.updated_at = new Date().toISOString();
  saveData(data);

  // Send main.html directly to avoid a 302->static->404 chain.
  const mainFile = path.join(__dirname, "public", "main.html");
  res.sendFile(mainFile, (err) => {
    if (err) {
      // If main.html is missing or sendFile fails, return a safe fallback
      console.error("sendFile error for /:digit ->", err);
      // Fallback: redirect to /main.html (will produce 404 if file missing)
      res.redirect("/main.html");
    }
  });
});

// Serve static assets from public after numeric route
app.use(express.static(path.join(__dirname, "public")));

// Keep existing /main.html/:digit behavior
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

// /me returns all visitors (as requested earlier)
app.get("/me", ensureAnonId, (req, res) => {
  const data = loadData();
  res.json({ anon_id: req.anonId, visitors: data.visitors });
});

// Optional: fallback 404 for other routes
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("running"));
