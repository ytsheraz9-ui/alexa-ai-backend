const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// All routes here require a logged-in admin (role: "admin")
router.use(requireAuth, requireAdmin);

// ---------------------------------------------
// GET /api/admin/users
// Returns every user with real usage stats — no fake/localStorage data.
// ---------------------------------------------
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { sessions: true } }
      }
    });

    // Count actual messages sent by each user (across all their chat sessions)
    const usersWithMessageCounts = await Promise.all(
      users.map(async (u) => {
        const messageCount = await prisma.message.count({
          where: { role: "user", session: { userId: u.id } }
        });
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          sessionCount: u._count.sessions,
          messageCount,
          isOnline: u.lastLoginAt ? new Date(u.lastLoginAt) > fiveMinAgo : false
        };
      })
    );

    res.json({ status: "ok", users: usersWithMessageCounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error. Baad mein try karein." });
  }
});

// ---------------------------------------------
// GET /api/admin/users/:id/sessions
// Lists a specific user's chat session titles (for the admin to inspect activity)
// ---------------------------------------------
router.get("/users/:id/sessions", async (req, res) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.params.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } }
    });
    res.json({ status: "ok", sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;