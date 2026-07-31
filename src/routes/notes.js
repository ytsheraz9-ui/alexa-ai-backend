const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth); // every route here requires login

router.get("/", async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: "desc" }
  });
  res.json({ status: "ok", notes });
});

router.post("/", async (req, res) => {
  const { title, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Note content is required." });

  const note = await prisma.note.create({
    data: { userId: req.user.userId, title: (title || "Untitled").trim(), content: content.trim() }
  });
  res.status(201).json({ status: "ok", note });
});

router.patch("/:id", async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });

  const data = {};
  if (typeof req.body.title === "string") data.title = req.body.title.trim();
  if (typeof req.body.content === "string") data.content = req.body.content.trim();

  const updated = await prisma.note.update({ where: { id: note.id }, data });
  res.json({ status: "ok", note: updated });
});

router.delete("/:id", async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });

  await prisma.note.delete({ where: { id: note.id } });
  res.json({ status: "ok" });
});

module.exports = router;