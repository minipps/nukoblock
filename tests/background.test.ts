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
