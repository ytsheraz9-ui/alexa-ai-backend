const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.2, // sample 20% of requests for performance tracing, to keep the free quota healthy
  environment: process.env.NODE_ENV || "production"
});

module.exports = Sentry;