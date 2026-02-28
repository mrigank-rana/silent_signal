import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("silent_signal.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    duress_pin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    phone TEXT,
    email TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sos_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    latitude REAL,
    longitude REAL,
    audio_url TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  // Auth: Register
  app.post("/api/auth/register", (req, res) => {
    const { username, password, duressPin } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO users (username, password, duress_pin) VALUES (?, ?, ?)");
      const info = stmt.run(username, password, duressPin);
      res.json({ id: info.lastInsertRowid, username });
    } catch (error) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  // Auth: Login
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    // Check normal password
    if (user.password === password) {
      return res.json({ id: user.id, username: user.username, mode: "NORMAL" });
    }

    // Check duress PIN
    if (user.duress_pin === password) {
      // Silently trigger SOS
      console.log(`[SOS TRIGGERED] User ${user.username} logged in with DURESS PIN`);
      return res.json({ id: user.id, username: user.username, mode: "DURESS" });
    }

    res.status(401).json({ error: "Invalid credentials" });
  });

  // Contacts
  app.get("/api/contacts/:userId", (req, res) => {
    const contacts = db.prepare("SELECT * FROM contacts WHERE user_id = ?").all(req.params.userId);
    res.json(contacts);
  });

  app.post("/api/contacts", (req, res) => {
    const { userId, name, phone, email } = req.body;
    const stmt = db.prepare("INSERT INTO contacts (user_id, name, phone, email) VALUES (?, ?, ?, ?)");
    const info = stmt.run(userId, name, phone, email);
    res.json({ id: info.lastInsertRowid });
  });

  // SOS Trigger
  app.post("/api/sos/trigger", (req, res) => {
    const { userId, latitude, longitude } = req.body;
    const stmt = db.prepare("INSERT INTO sos_logs (user_id, latitude, longitude) VALUES (?, ?, ?)");
    const info = stmt.run(userId, latitude, longitude);
    
    // Simulate sending SMS/Email to contacts
    const contacts = db.prepare("SELECT * FROM contacts WHERE user_id = ?").all(userId) as any[];
    console.log(`[SOS ALERT] Sending alerts to ${contacts.length} contacts for user ${userId}`);
    contacts.forEach(c => {
      console.log(`[ALERT SENT] To: ${c.name} (${c.phone}) - Location: ${latitude}, ${longitude}`);
    });

    res.json({ success: true, logId: info.lastInsertRowid });
  });

  // Notes (Decoy Data)
  app.get("/api/notes/:userId", (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
      res.json(notes);
    } catch (error) {
      console.error("Fetch notes error:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.post("/api/notes", (req, res) => {
    const { userId, title, content } = req.body;
    console.log(`[NOTE SAVE] User ${userId} saving note: ${title}`);
    try {
      const stmt = db.prepare("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)");
      const info = stmt.run(userId, title, content);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Save note error:", error);
      res.status(500).json({ error: "Failed to save note" });
    }
  });

  // Audio Upload (Simulated storage in DB for hackathon simplicity)
  app.post("/api/sos/audio", express.raw({ type: "audio/webm", limit: "10mb" }), (req, res) => {
    const userId = req.query.userId;
    const audioBase64 = req.body.toString("base64");
    console.log(`[AUDIO UPLOAD] Received audio chunk from user ${userId}`);
    
    try {
      const stmt = db.prepare("INSERT INTO sos_logs (user_id, audio_url, status) VALUES (?, ?, ?)");
      stmt.run(userId, `data:audio/webm;base64,${audioBase64}`, "AUDIO_CHUNK");
      res.json({ success: true });
    } catch (error) {
      console.error("Audio upload error:", error);
      res.status(500).json({ error: "Failed to save audio" });
    }
  });

  // Get SOS Logs
  app.get("/api/sos/logs/:userId", (req, res) => {
    try {
      const logs = db.prepare("SELECT id, user_id, latitude, longitude, audio_url, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM sos_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.params.userId);
      res.json(logs);
    } catch (error) {
      console.error("Fetch logs error:", error);
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
