const jwt = require("jsonwebtoken");

// This middleware protects routes — it checks for a valid JWT token
// in the Authorization header before letting the request continue.
// Usage: app.get("/api/something", requireAuth, (req, res) => { ... })

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization; // format: "Bearer <token>"

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required. Token missing." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired ya token invalid hai. Dobara login karein." });
  }
}

// Optional: restricts a route to admin-role users only
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Sirf admin ye kaam kar sakta hai." });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };