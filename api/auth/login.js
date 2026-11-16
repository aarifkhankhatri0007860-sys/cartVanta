const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 10000
});

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(503).json({
        error: "Admin authentication is not configured. Add JWT_SECRET (32+ characters), ADMIN_EMAIL and ADMIN_PASSWORD in Vercel."
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const password = String(body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash, role FROM admins WHERE email = $1",
      [email]
    );

    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const admin = result.rows[0];
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      secret,
      { expiresIn: "12h" }
    );

    return res.status(200).json({ token });
  } catch (error) {
    console.error("CartVanta login:", error);
    return res.status(500).json({ error: "Login service temporarily unavailable" });
  }
};
