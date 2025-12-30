const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.set("trust proxy", 1); // 배포 프록시 환경 대응

app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

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
      secure: isProd, // 배포(https)에서 true 권장
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

// 변경: /me에서 현재 사용자 뿐 아니라 모든 방문자 데이터를 반환하도록 수정
app.get("/me", ensureAnonId, (req, res) => {
  const data = loadData();
  res.json({ anon_id: req.anonId, visitors: data.visitors });
});

// 추가: 루트 경로 바로 아래에 single-digit(1-9) 요청을 처리합니다.
// 예: GET /3 -> 같은 동작(데이터 업데이트 후 /main.html로 리다이렉트)
app.get("/:digit", ensureAnonId, (req, res) => {
  const d = req.params.digit;
  if (!/^[1-9]$/.test(d)) return res.status(400).send("digit must be 1~9.");

  const data = loadData();
  const row = data.visitors[req.anonId];
  row.digits += d;
  row.updated_at = new Date().toISOString();
  saveData(data);

  res.redirect("/main.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("running"));
