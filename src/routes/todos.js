const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth); // every route here requires login

// GET /api/todos — list this user's tasks
router.get("/", async (req, res) => {
  const todos = await prisma.todo.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: "desc" }
  });
  res.json({ status: "ok", todos });
});

// POST /api/todos — create a new task
router.post("/", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Task text is required." });

  const todo = await prisma.todo.create({
    data: { userId: req.user.userId, text: text.trim() }
  });
  res.status(201).json({ status: "ok", todo });
});

// PATCH /api/todos/:id — toggle done / edit text
router.patch("/:id", async (req, res) => {
  const todo = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
  if (!todo) return res.status(404).json({ error: "Task not found." });

  const data = {};
  if (typeof req.body.done === "boolean") data.done = req.body.done;
  if (typeof req.body.text === "string") data.text = req.body.text.trim();

  const updated = await prisma.todo.update({ where: { id: todo.id }, data });
  res.json({ status: "ok", todo: updated });
});

// DELETE /api/todos/:id
router.delete("/:id", async (req, res) => {
  const todo = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
  if (!todo) return res.status(404).json({ error: "Task not found." });

  await prisma.todo.delete({ where: { id: todo.id } });
  res.json({ status: "ok" });
});

module.exports = router;