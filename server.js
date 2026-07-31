"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const MAX_PLAYERS = 20;
const ADMIN_USER = "sandro";
const ADMIN_PASS = "sandro123";
const members = new Map();
const sessions = new Map();
const playerTokens = new Map();

const settings = {
    title: "SANDRO GAME",
    effect: "rgb"
};

function token() {
    return crypto.randomBytes(24).toString("hex");
}

function now() {
    return Date.now();
}

function cleanupPlayers() {
    const timeLimit = now() - 30000;
    for (const [t, p] of playerTokens.entries()) {
        if (p.lastSeen < timeLimit) playerTokens.delete(t);
    }
}

function onlineCount() {
    cleanupPlayers();
    return playerTokens.size;
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/settings", (req, res) => {
    res.json(settings);
});

app.get("/api/settings/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = () => {
        res.write(`event: settings\ndata: ${JSON.stringify(settings)}\n\n`);
        res.write(`data: ${JSON.stringify({ count: onlineCount(), max: MAX_PLAYERS })}\n\n`);
    };

    send();
    const timer = setInterval(send, 5000);
    req.on("close", () => clearInterval(timer));
});

app.post("/api/login", (req, res) => {
    const { username = "", password = "" } = req.body || {};
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({ error: "Username atau password admin salah." });
    }

    const sid = token();
    sessions.set(sid, { username: ADMIN_USER });
    res.setHeader("Set-Cookie", `sid=${sid}; Path=/; HttpOnly`);
    res.json({ username: ADMIN_USER });
});

app.post("/api/logout", (req, res) => {
    const cookie = (req.headers.cookie || "").match(/sid=([^;]+)/);
    if (cookie) sessions.delete(cookie[1]);
    res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
    const cookie = (req.headers.cookie || "").match(/sid=([^;]+)/);
    const user = cookie ? sessions.get(cookie[1]) : null;
    res.json(user ? { loggedIn: true, username: user.username } : { loggedIn: false });
});

app.post("/api/member/register", (req, res) => {
    const { username = "", password = "" } = req.body || {};
    if (members.has(username)) return res.status(400).json({ error: "Username sudah terdaftar." });
    const memberToken = token();
    members.set(username, { password, token: memberToken });
    res.json({ username, token: memberToken });
});

app.post("/api/member/login", (req, res) => {
    const { username = "", password = "" } = req.body || {};
    const acc = members.get(username);
    if (!acc || acc.password !== password) return res.status(401).json({ error: "Login member gagal." });
    res.json({ username, token: acc.token });
});

app.get("/api/member/session", (req, res) => {
    const t = req.header("X-Member-Token");
    for (const [username, acc] of members.entries()) {
        if (acc.token === t) return res.json({ loggedIn: true, username, token: t });
    }
    res.status(401).json({ loggedIn: false });
});

app.post("/api/member/heartbeat", (req, res) => {
    const t = req.header("X-Member-Token");
    if (!t) return res.sendStatus(401);
    res.json({ ok: true });
});

app.post("/api/member/logout", (req, res) => {
    res.json({ ok: true });
});

app.post("/api/players/join", (req, res) => {
    const { token: t = "" } = req.body || {};
    if (!t) return res.status(401).json({ error: "Token tidak valid." });

    cleanupPlayers();
    if (playerTokens.size >= MAX_PLAYERS && !playerTokens.has(t)) {
        return res.status(429).json({ error: "Server penuh. Tunggu pemain lain keluar.", count: playerTokens.size, max: MAX_PLAYERS });
    }

    playerTokens.set(t, { lastSeen: now() });
    res.json({ count: playerTokens.size, max: MAX_PLAYERS });
});

app.post("/api/players/heartbeat", (req, res) => {
    const { token: t = "" } = req.body || {};
    if (!playerTokens.has(t)) return res.sendStatus(401);
    playerTokens.get(t).lastSeen = now();
    res.json({ count: playerTokens.size, max: MAX_PLAYERS });
});

app.post("/api/players/leave", (req, res) => {
    const { token: t = "" } = req.body || {};
    if (t) playerTokens.delete(t);
    res.json({ ok: true });
});

app.put("/api/settings", (req, res) => {
    const cookie = (req.headers.cookie || "").match(/sid=([^;]+)/);
    const user = cookie ? sessions.get(cookie[1]) : null;
    if (!user) return res.sendStatus(401);

    const { title = "SANDRO GAME", effect = "rgb" } = req.body || {};
    settings.title = String(title).slice(0, 60);
    settings.effect = ["rgb", "glow", "none"].includes(effect) ? effect : "rgb";
    res.json({ settings });
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});