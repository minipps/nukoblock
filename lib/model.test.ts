import { describe, it, expect } from "vitest";
import {
  bar,
  defaults,
  normalize,
  matches,
  pickNudge,
  policyFor,
  siteFor,
  validateSettings,
  type Site,
} from "./model";
const site: Site = {
  id: "a",
  targets: ["youtube.com"],
  policy: { mode: "limit", minutes: 30, pause: true },
  windows: [
    {
      days: [5],
      start: "22:00",
      end: "02:00",
      policy: { mode: "block", minutes: 30, pause: false },
    },
  ],
};
describe("rules", () => {
  it("normalizes and checks boundaries", () => {
    expect(normalize("https://YouTube.com/shorts/?x=1")).toBe("youtube.com/shorts");
    expect(matches("https://m.youtube.com/shorts/123", "youtube.com/shorts")).toBe(true);
    expect(matches("https://youtube.com/shortstuff", "youtube.com/shorts")).toBe(false);
    expect(matches("https://notyoutube.com", "youtube.com")).toBe(false);
  });
  it("selects specific paths", () =>
    expect(
      siteFor("https://youtube.com/shorts", [
        site,
        { ...site, id: "b", targets: ["youtube.com/shorts"] },
      ])?.id,
    ).toBe("b"));
  it("handles overnight schedules", () => {
    expect(policyFor(site, new Date(2026, 10, 14, 1)).mode).toBe("block");
    expect(policyFor(site, new Date(2026, 10, 14, 3)).mode).toBe("limit");
  });
});
describe("bar", () => {
  it("fills proportionally and clamps", () => {
    expect(bar(5, 10, 4)).toBe("██░░");
    expect(bar(50, 10, 4)).toBe("████");
    expect(bar(-1, 0, 4)).toBe("░░░░");
  });
});
describe("nudges", () => {
  it("never repeats the last nudge when there is a choice", () => {
    for (const r of [0, 0.5, 0.99])
      expect(pickNudge(["breathe", "feeling"], "breathe", r)).toBe("feeling");
    expect(pickNudge(["duration"], "duration", 0.5)).toBe("duration");
    expect(pickNudge([], undefined, 0.5)).toBe("breathe");
  });
  it("fills nudge settings for older saved settings", () => {
    const { nudges, alternatives, ...old } = structuredClone(defaults);
    const s = validateSettings(old);
    expect(s.nudges).toEqual(nudges);
    expect(s.alternatives).toEqual(alternatives);
  });
});
