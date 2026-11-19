import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { day, defaults } from "../lib/model";

let local: Record<string, any>, session: Record<string, any>, tabs: any[], alarm: () => void;
const event = () => ({ addListener: vi.fn<() => void>() });
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  local = {
    settings: {
      ...defaults,
      sites: [
        {
          id: "video",
          targets: ["youtube.com"],
          policy: { mode: "limit", minutes: 30, pause: false },
          windows: [],
        },
      ],
    },
  };
  session = {};
  tabs = [
    {
      id: 1,
      url: "https://youtube.com/watch?v=1",
      active: true,
      windowId: 1,
      audible: true,
    },
    {
      id: 2,
      url: "https://youtube.com/watch?v=2",
      active: false,
      windowId: 1,
      audible: true,
    },
  ];
  const store = (data: Record<string, any>) => ({
    get: async () => structuredClone(data),
    set: async (value: any) => Object.assign(data, structuredClone(value)),
    clear: async () => {
      for (const key of Object.keys(data)) delete data[key];
    },
  });
  vi.stubGlobal("defineBackground", (fn: () => void) => fn());
  vi.stubGlobal("browser", {
    storage: {
      local: store(local),
      session: store(session),
      onChanged: event(),
    },
    tabs: {
      query: async () => tabs,
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
      update: vi.fn<() => void>(),
    },
    windows: {
      getLastFocused: async () => ({ id: 1, focused: true }),
      onFocusChanged: event(),
    },
    idle: { queryState: async () => "active", onStateChanged: event() },
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      getSessionRules: async () => [],
      updateDynamicRules: vi.fn<() => void>(),
      updateSessionRules: vi.fn<() => void>(),
    },
    runtime: {
      getURL: (path: string) => "chrome-extension://test" + path,
      onMessage: event(),
      onStartup: event(),
    },
    alarms: {
      create: vi.fn<() => void>(),
      onAlarm: {
        addListener: (fn: () => void) => {
          alarm = fn;
        },
      },
    },
    webNavigation: {
      onHistoryStateUpdated: event(),
      onReferenceFragmentUpdated: event(),
    },
    permissions: { onRemoved: event() },
    action: {
      setBadgeText: vi.fn<() => void>(),
      setBadgeBackgroundColor: vi.fn<() => void>(),
      setBadgeTextColor: vi.fn<() => void>(),
    },
    scripting: { executeScript: vi.fn<() => Promise<unknown[]>>(async () => []) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("counts audible background tabs once per site and excludes delayed sleep intervals", async () => {
  await import("../entrypoints/background");
  await flush();
  tabs.forEach((t) => (t.active = false));
  vi.advanceTimersByTime(30000);
  alarm();
  await flush();
  expect(local.usage[day()].video).toBe(30000);
  vi.advanceTimersByTime(30000);
  alarm();
  await flush();
  expect(local.usage[day()].video).toBe(60000);
  vi.advanceTimersByTime(3600000);
  alarm();
  await flush();
  expect(local.usage[day()].video).toBe(60000);
});
it("does not count muted background playback", async () => {
  tabs.forEach((t) => {
    t.active = false;
    t.mutedInfo = { muted: true };
  });
  await import("../entrypoints/background");
  await flush();
  vi.advanceTimersByTime(30000);
  alarm();
  await flush();
  expect(local.usage[day()]?.video ?? 0).toBe(0);
});
it("lets a 'how long' nudge through only with a duration, then sends the tab back", async () => {
  local.settings.sites[0].policy.pause = true;
  local.settings.nudges = ["duration"];
  await import("../entrypoints/background");
  await flush();
  const b = (globalThis as any).browser;
  const handler = b.runtime.onMessage.addListener.mock.calls[0][0];
  const url = "https://youtube.com/watch?v=1";
  const sender = { tab: { id: 1 }, url: "chrome-extension://test/gate.html#" + url };
  expect(await handler({ type: "pause", url }, sender)).toEqual({
    blocked: false,
    nudge: "duration",
  });
  await handler({ type: "continue", url }, sender);
  expect(session.runtime.grants[1]).toBeUndefined();
  await handler({ type: "continue", url, minutes: 5 }, sender);
  expect(session.runtime.grants[1].until).toBe(Date.now() + 300000);
  b.tabs.update.mockClear();
  vi.advanceTimersByTime(300000);
  alarm();
  await flush();
  expect(session.runtime.grants[1]).toBeUndefined();
  expect(b.tabs.update).toHaveBeenCalledWith(1, {
    url: "chrome-extension://test/gate.html#" + url,
  });
});
it("lets tabs opened from a granted tab skip the nudge, keeping its deadline", async () => {
  local.settings.sites[0].policy.pause = true;
  local.settings.nudges = ["duration"];
  await import("../entrypoints/background");
  await flush();
  const b = (globalThis as any).browser;
  const handler = b.runtime.onMessage.addListener.mock.calls[0][0];
  const gate = "chrome-extension://test/gate.html#";
  const url = "https://youtube.com/watch?v=1";
  await handler({ type: "pause", url }, { tab: { id: 1 }, url: gate + url });
  await handler({ type: "continue", url, minutes: 5 }, { tab: { id: 1 }, url: gate + url });
  const child = "https://youtube.com/watch?v=3";
  tabs.push({ id: 3, url: gate + child, openerTabId: 1, windowId: 1 });
  expect(
    await handler(
      { type: "pause", url: child },
      { tab: { id: 3, openerTabId: 1 }, url: gate + child },
    ),
  ).toEqual({ blocked: false });
  expect(session.runtime.grants[3]).toMatchObject({ site: "video", until: Date.now() + 300000 });
  expect(b.tabs.update).toHaveBeenCalledWith(3, { url: child });
  tabs.push({ id: 4, url: gate + child, openerTabId: 2, windowId: 1 });
  expect(
    await handler(
      { type: "pause", url: child },
      { tab: { id: 4, openerTabId: 2 }, url: gate + child },
    ),
  ).toMatchObject({ nudge: "duration" });
});
it("shows today's time in the badge and, when enabled, on the page", async () => {
  local.usage = { [day()]: { video: 65 * 60000 } };
  local.settings.show = { badge: true, page: true };
  await import("../entrypoints/background");
  await flush();
  const b = (globalThis as any).browser;
  expect(b.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "1h05" });
  expect(b.action.setBadgeText).not.toHaveBeenCalledWith(expect.objectContaining({ tabId: 2 }));
  expect(b.scripting.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 1 },
      args: ["1h05 / 30m today", expect.anything()],
    }),
  );
});
