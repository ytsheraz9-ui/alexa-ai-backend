const { PrismaClient } = require("@prisma/client");

// Prevents creating multiple PrismaClient instances during development
const prisma = new PrismaClient();

module.exports = prisma;