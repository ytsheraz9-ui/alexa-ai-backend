// This file must be required FIRST, before any other module in the app —
// that's what lets Sentry automatically capture errors from Express, Prisma, etc.
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Only send events if a DSN is actually configured — keeps local development
  // and any environment without Sentry set up completely silent (no errors, no cost).
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.2, // sample 20% of requests for performance tracing, to keep the free quota healthy
  environment: process.env.NODE_ENV || "production"
});

module.exports = Sentry;