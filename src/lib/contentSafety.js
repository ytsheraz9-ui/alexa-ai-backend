// ============================================================
// CONTENT SAFETY FILTER
// ============================================================
// A lightweight, defense-in-depth check that runs BEFORE a message is sent
// to the AI. Groq's models already refuse most harmful requests on their own —
// this adds a second layer that blocks the most severe categories outright,
// without spending an API call, and logs the attempt for admin visibility.
//
// This is intentionally conservative: it only blocks clear, severe categories
// (weapons/explosives instructions, child sexual abuse material, detailed
// self-harm methods) rather than trying to police every borderline topic,
// which is best left to the model's own judgement.

const SEVERE_PATTERNS = [
  // Weapons / explosives — instructions to build or deploy
  /\b(how (to|do i) (make|build|synthesize|create)\b.{0,40}\b(bomb|explosive|detonator|nerve agent|chemical weapon|bioweapon))\b/i,
  /\b(step[- ]by[- ]step\b.{0,40}\b(bomb|explosive|weapon))\b/i,

  // Child sexual abuse material — any request related to this is blocked outright
  /\b(child|minor|kid|underage)\b.{0,40}\b(sexual|explicit|nude|porn)\b/i,

  // Detailed self-harm method requests (distinct from someone reaching out for help,
  // which the AI should still respond to supportively — this only blocks explicit
  // "how do I" method-seeking phrasing)
  /\b(most effective|painless|guaranteed)\b.{0,30}\b(way|method)\b.{0,20}\b(kill myself|suicide|end my life)\b/i
];

function checkContentSafety(message) {
  if (!message) return { safe: true };

  for (const pattern of SEVERE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        safe: false,
        reason: "This request involves content I'm not able to help with. If you're going through something difficult, please reach out to a trusted person or a local support service."
      };
    }
  }

  return { safe: true };
}

module.exports = { checkContentSafety };