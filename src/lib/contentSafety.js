const SEVERE_PATTERNS = [
  /\b(how (to|do i) (make|build|synthesize|create)\b.{0,40}\b(bomb|explosive|detonator|nerve agent|chemical weapon|bioweapon))\b/i,
  /\b(step[- ]by[- ]step\b.{0,40}\b(bomb|explosive|weapon))\b/i,

  /\b(child|minor|kid|underage)\b.{0,40}\b(sexual|explicit|nude|porn)\b/i,

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