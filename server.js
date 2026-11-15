const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const app = express();
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "store.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "";
const API_KEY = process.env.ZAPAY_API_KEY || "";
const API_BASE = (process.env.ZAPAY_BASE_URL || "https://zapay.zannmods.net/api/v1").replace(/\/$/, "");

if (!SESSION_SECRET || SESSION_SECRET.length < 32) console.warn("[WARN] SESSION_SECRET belum 32 karakter.");
if (!OWNER_EMAIL || !OWNER_PASSWORD) console.warn("[WARN] OWNER_EMAIL/OWNER_PASSWORD belum diatur.");
fs.mkdirSync(DATA_DIR, { recursive: true });

function freshDB() {
  return { users: [], sessions: [], orders: [], codes: [], trials: [] };
}
function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { ...freshDB(), ...db };
  } catch {
    const db = freshDB();
    saveDB(db);
    return db;
  }
}
let db = loadDB();
function saveDB(next = db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
const now = () => new Date().toISOString();
const id = (prefix) => prefix + "_" + crypto.randomBytes(9).toString("hex");
const cleanEmail = (v) => String(v || "").trim().toLowerCase();
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, user) {
  const hash = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return safeEqual(hash, user.passwordHash);
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET || "development-only").update(body).digest("base64url");
  return body + "." + sig;
}
function readToken(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET || "development-only").update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
function auth(req, res, next) {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("hendar_session="))?.slice("hendar_session=".length);
  const data = readToken(token);
  const user = data && db.users.find(u => u.id === data.uid);
  if (!user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  req.user = user;
  next();
}
function ownerOnly(req, res, next) {
  if (!req.user.isOwner) return res.status(403).json({ error: "Akses khusus owner." });
  next();
}
function setSession(res, user) {
  const token = sign({ uid: user.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", `hendar_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, isOwner: !!u.isOwner };
}
function findProduct(productId) { return config.products.find(p => p.id === productId); }

app.get("/api/config", (req, res) => {
  res.json({ products: config.products, trialHours: config.trialHours });
});

app.post("/api/register", (req, res) => {
  const username = String(req.body.username || "").trim().slice(0, 24);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: "Username minimal 3 karakter, hanya huruf, angka, dan _." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email tidak valid." });
  if (password.length < 8) return res.status(400).json({ error: "Password minimal 8 karakter." });
  if (db.users.some(u => u.email === email || u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "Email atau username sudah digunakan." });
  const pw = hashPassword(password);
  const user = { id: id("usr"), username, email, salt: pw.salt, passwordHash: pw.hash, isOwner: false, createdAt: now() };
  db.users.push(user); saveDB(); setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  let user = db.users.find(u => u.email === email);
  if (!user && email === OWNER_EMAIL && safeEqual(password, OWNER_PASSWORD)) {
    const pw = hashPassword(password);
    user = { id: id("owner"), username: "Owner", email, salt: pw.salt, passwordHash: pw.hash, isOwner: true, createdAt: now() };
    db.users.push(user); saveDB();
  }
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ error: "Email atau password salah." });
  if (email === OWNER_EMAIL) user.isOwner = true;
  saveDB(); setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "hendar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ success: true });
});
app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post("/api/trial", auth, (req, res) => {
  if (db.trials.some(t => t.userId === req.user.id)) return res.status(409).json({ error: "Free Trial hanya bisa digunakan satu kali per akun." });
  const trial = { id: id("trial"), userId: req.user.id, startsAt: now(), expiresAt: new Date(Date.now() + config.trialHours * 3600000).toISOString() };
  db.trials.push(trial); saveDB();
  res.json({ success: true, trial });
});
app.get("/api/trial", auth, (req, res) => {
  const trial = db.trials.find(t => t.userId === req.user.id);
  res.json({ trial: trial || null, active: !!trial && Date.now() < Date.parse(trial.expiresAt) });
});

app.post("/api/orders", auth, async (req, res) => {
  try {
    if (!API_KEY) return res.status(503).json({ error: "ZAPAY_API_KEY belum diisi di Railway Variables." });
    const product = findProduct(String(req.body.productId || ""));
    if (!product) return res.status(400).json({ error: "Paket tidak ditemukan." });
    const orderId = "HENDAR-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const response = await fetch(`${API_BASE}/createtransaksi`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, amount: product.price, method: "qris", description: `HENDAR BOT WA - ${product.name}` })
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.data) return res.status(502).json({ error: data.message || "Gagal membuat QRIS dari Zapay.", detail: data });
    const order = { id: id("ord"), orderId, userId: req.user.id, productId: product.id, productName: product.name, amount: product.price, status: "pending", payUrl: data.data.pay_url || null, qrUrl: data.data.payment?.qr_url || null, expiresAt: data.data.payment?.expires_at || null, createdAt: now(), code: null };
    db.orders.push(order); saveDB();
    res.json({ order: { orderId, productName: product.name, amount: product.price, total: data.data.total, payUrl: order.payUrl, qrUrl: order.qrUrl, expiresAt: order.expiresAt, status: order.status } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Kesalahan saat membuat transaksi." }); }
});

async function checkOrder(order, user) {
  const response = await fetch(`${API_BASE}/statustransaksi?order_id=${encodeURIComponent(order.orderId)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Gagal mengecek status transaksi.");
  const status = String(result.data?.status || result.status || "pending").toLowerCase();
  order.status = status;
  if (status === "paid" && !order.code) {
    const code = db.codes.find(c => c.productId === order.productId && !c.usedAt);
    if (code) {
      code.usedAt = now(); code.usedBy = user.id; code.orderId = order.orderId;
      order.code = code.code; order.codeDeliveredAt = now();
    } else {
      order.code = null; order.stockEmpty = true;
    }
    order.paidAt = now();
    saveDB();
    notifyOwner(order, user).catch(err => console.error("Discord notify:", err.message));
  } else saveDB();
  return { status: order.status, code: order.code, stockEmpty: !!order.stockEmpty, productName: order.productName };
}
async function notifyOwner(order, user) {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return;
  await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `✅ **Pembayaran HENDAR BOT WA berhasil**\\nOrder: ${order.orderId}\\nPembeli: ${user.username} (${user.email})\\nPaket: ${order.productName}\\nNominal: Rp${order.amount.toLocaleString("id-ID")}\\nKode: ${order.code || "STOK HABIS - perlu ditangani owner"}` }) });
}
app.get("/api/orders/:orderId", auth, async (req, res) => {
  try {
    const order = db.orders.find(o => o.orderId === req.params.orderId && o.userId === req.user.id);
    if (!order) return res.status(404).json({ error: "Transaksi tidak ditemukan." });
    if (order.status === "pending") {
      const checked = await checkOrder(order, req.user);
      return res.json({ order: { ...checked, orderId: order.orderId, amount: order.amount, payUrl: order.payUrl, qrUrl: order.qrUrl, expiresAt: order.expiresAt } });
    }
    res.json({ order: { status: order.status, code: order.code, stockEmpty: !!order.stockEmpty, orderId: order.orderId, amount: order.amount, productName: order.productName, payUrl: order.payUrl, qrUrl: order.qrUrl, expiresAt: order.expiresAt } });
  } catch (e) { res.status(502).json({ error: e.message || "Gagal mengecek status." }); }
});
app.post("/api/orders/:orderId/cancel", auth, async (req, res) => {
  try {
    const order = db.orders.find(o => o.orderId === req.params.orderId && o.userId === req.user.id);
    if (!order) return res.status(404).json({ error: "Transaksi tidak ditemukan." });
    if (order.status !== "pending") return res.status(400).json({ error: "Hanya transaksi pending yang bisa dibatalkan." });
    const response = await fetch(`${API_BASE}/batalkantransaksi`, { method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ order_id: order.orderId }) });
    const data = await response.json();
    if (!response.ok || data.success === false) return res.status(502).json({ error: data.message || "Gagal membatalkan transaksi." });
    order.status = "canceled"; saveDB();
    res.json({ success: true, status: "canceled" });
  } catch (e) { res.status(500).json({ error: e.message || "Gagal membatalkan transaksi." }); }
});

app.get("/api/owner/codes", auth, ownerOnly, (req, res) => {
  res.json({ codes: db.codes.map(c => ({ id: c.id, productId: c.productId, code: c.code, usedAt: c.usedAt || null, usedBy: c.usedBy || null })) });
});
app.post("/api/owner/codes", auth, ownerOnly, (req, res) => {
  const productId = String(req.body.productId || "");
  const code = String(req.body.code || "").trim().slice(0, 100);
  if (!findProduct(productId)) return res.status(400).json({ error: "Pilih paket yang valid." });
  if (code.length < 4) return res.status(400).json({ error: "Kode minimal 4 karakter." });
  if (db.codes.some(c => c.code.toLowerCase() === code.toLowerCase())) return res.status(409).json({ error: "Kode sudah ada." });
  db.codes.push({ id: id("code"), productId, code, createdAt: now(), usedAt: null });
  saveDB(); res.json({ success: true });
});
app.delete("/api/owner/codes/:codeId", auth, ownerOnly, (req, res) => {
  const item = db.codes.find(c => c.id === req.params.codeId);
  if (!item) return res.status(404).json({ error: "Kode tidak ditemukan." });
  if (item.usedAt) return res.status(400).json({ error: "Kode yang sudah terpakai tidak bisa dihapus." });
  db.codes = db.codes.filter(c => c.id !== item.id); saveDB(); res.json({ success: true });
});
app.get("/api/owner/summary", auth, ownerOnly, (req, res) => {
  res.json({
    users: db.users.filter(u => !u.isOwner).length,
    orders: db.orders.length,
    paid: db.orders.filter(o => o.status === "paid").length,
    codes: config.products.map(p => ({ ...p, available: db.codes.filter(c => c.productId === p.id && !c.usedAt).length, used: db.codes.filter(c => c.productId === p.id && c.usedAt).length }))
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`HENDAR BOT WA berjalan di port ${PORT}`));
