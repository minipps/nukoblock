const trailingSlash = /\/$/;
const hexColor = /^#[0-9a-f]{6}$/i;
const clockTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type Policy = {
  mode: "track" | "limit" | "block";
  minutes: number;
  pause: boolean;
};
export type Site = {
  id: string;
  targets: string[];
  policy: Policy;
  windows: { days: number[]; start: string; end: string; policy: Policy }[];
};
export const nudges = ["breathe", "elsewhere", "feeling", "duration"] as const;
export type Nudge = (typeof nudges)[number];
export type Settings = {
  version: 1;
  sites: Site[];
  colors: Record<string, string>;
  nudges: Nudge[];
  alternatives: string[];
};
export const defaults: Settings = {
  version: 1,
  sites: [],
  colors: {
    background: "#1e1e2e",
    surface: "#313244",
    text: "#cdd6f4",
    accent: "#cba6f7",
  },
  nudges: [...nudges],
  alternatives: [
    "stretch for a minute",
    "drink a glass of water",
    "message a friend",
    "step outside for a bit",
    "read a few pages of a book",
  ],
};
export function normalize(input: string) {
  const u = new URL(input.includes("://") ? input : `https://${input}`);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error("Use an HTTP(S) domain or URL");
  return u.hostname.toLowerCase() + u.pathname.replace(trailingSlash, "");
}
export function matches(url: string, target: string) {
  try {
    const u = new URL(url),
      t = new URL(`https://${target}`);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      (u.hostname === t.hostname || u.hostname.endsWith("." + t.hostname)) &&
      (t.pathname === "/" || u.pathname === t.pathname || u.pathname.startsWith(t.pathname + "/"))
    );
  } catch {
    return false;
  }
}
export function siteFor(url: string, sites: Site[]) {
  return sites
    .flatMap((s) => s.targets.filter((t) => matches(url, t)).map((t) => ({ s, n: t.length })))
    .sort((a, b) => b.n - a.n)[0]?.s;
}
export function policyFor(s: Site, d = new Date()) {
  const time = d.getHours() * 60 + d.getMinutes();
  const minute = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  return (
    s.windows.find((w) => {
      const a = minute(w.start),
        b = minute(w.end);
      return a < b
        ? w.days.includes(d.getDay()) && time >= a && time < b
        : (w.days.includes(d.getDay()) && time >= a) ||
            (w.days.includes((d.getDay() + 6) % 7) && time < b);
    })?.policy ?? s.policy
  );
}
export const day = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw Error("Invalid saved settings");
  const s = value as Settings;
  // Settings saved before nudges existed get the defaults.
  s.nudges ??= [...defaults.nudges];
  s.alternatives ??= [...defaults.alternatives];
  const policy = (p: Policy) =>
    p &&
    ["track", "limit", "block"].includes(p.mode) &&
    Number.isFinite(p.minutes) &&
    p.minutes > 0 &&
    typeof p.pause === "boolean";
  if (
    s.version !== 1 ||
    !Array.isArray(s.sites) ||
    !s.colors ||
    !Array.isArray(s.nudges) ||
    !s.nudges.every((n) => (nudges as readonly string[]).includes(n)) ||
    !Array.isArray(s.alternatives) ||
    !s.alternatives.every((a) => typeof a === "string" && a.length > 0 && a.length <= 200) ||
    !["background", "surface", "text", "accent"].every((k) => hexColor.test(s.colors[k] ?? ""))
  )
    throw Error("Unsupported or invalid settings");
  const ids = new Set<string>();
  for (const site of s.sites) {
    if (
      typeof site.id !== "string" ||
      ids.has(site.id) ||
      !Array.isArray(site.targets) ||
      !site.targets.length ||
      !site.targets.every((t) => typeof t === "string" && normalize(t) === t) ||
      !policy(site.policy) ||
      !Array.isArray(site.windows)
    )
      throw Error("Invalid site settings");
    ids.add(site.id);
    for (const w of site.windows)
      if (
        !Array.isArray(w.days) ||
        !w.days.length ||
        !w.days.every((d) => Number.isInteger(d) && d >= 0 && d < 7) ||
        ![w.start, w.end].every((t) => clockTime.test(t)) ||
        w.start === w.end ||
        !policy(w.policy)
      )
        throw Error("Invalid schedule");
  }
  return s;
}

export function bar(value: number, max: number, width = 20) {
  const filled = Math.round(Math.min(1, Math.max(0, value / (max || 1))) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// Picks a random enabled nudge, avoiding an immediate repeat when there is a choice.
export function pickNudge(enabled: Nudge[], last?: Nudge, random = Math.random()): Nudge {
  const pool = enabled.length > 1 ? enabled.filter((n) => n !== last) : enabled;
  return pool[Math.floor(random * pool.length)] ?? "breathe";
}
