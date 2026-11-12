import {
  validateSettings,
  defaults,
  siteFor,
  policyFor,
  day,
  pickNudge,
  type Nudge,
} from "../lib/model";

type Usage = Record<string, Record<string, number>>;
type Grant = { site: string; last: number; until?: number };
type Session = {
  grants: Record<number, Grant>;
  pauses: Record<number, { url: string; since: number; nudge: Nudge }>;
  lastNudge?: Nudge;
  active: string[];
  checkpoint: number;
};
export default defineBackground(() => {
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation);
    queue = next.catch(console.error);
    return next;
  }
  async function state() {
    const local = await browser.storage.local.get(["settings", "usage"]);
    const stored = await browser.storage.session.get("runtime");
    return {
      settings: validateSettings(local.settings ?? structuredClone(defaults)),
      usage: (local.usage as Usage) ?? {},
      session: (stored.runtime as Session) ?? {
        grants: {},
        pauses: {},
        active: [],
        checkpoint: Date.now(),
      },
    };
  }
  async function reconcile() {
    const { settings, usage, session } = await state();
    const now = Date.now();
    const gap = now - session.checkpoint;
    // shortcut: delayed checkpoints are discarded to avoid charging sleep, use platform suspend events if exact accounting becomes necessary.
    const elapsed = gap >= 0 && gap <= 60000 ? gap : 0;
    if (elapsed) {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      for (const id of session.active) {
        const current = Math.min(elapsed, now - midnight.getTime());
        const today = (usage[day()] ??= {});
        today[id] = (today[id] ?? 0) + current;
        if (elapsed > current) {
          const previous = (usage[day(new Date(midnight.getTime() - 1))] ??= {});
          previous[id] = (previous[id] ?? 0) + elapsed - current;
        }
      }
    }
    const tabs = await browser.tabs.query({});
    const focus = await browser.windows.getLastFocused();
    const idle = await browser.idle.queryState(300);
    const active = new Set<string>();
    for (const tab of tabs) {
      const site = siteFor(tab.url ?? "", settings.sites);
      if (
        site &&
        idle !== "locked" &&
        ((tab.active && tab.windowId === focus.id && focus.focused) ||
          (tab.audible && !tab.mutedInfo?.muted))
      ) {
        active.add(site.id);
        const grant = tab.id === undefined ? undefined : session.grants[tab.id];
        if (grant?.site === site.id) grant.last = now;
      }
    }
    for (const [key, grant] of Object.entries(session.grants))
      if (
        !tabs.some((t) => t.id === Number(key)) ||
        now - grant.last >= 300000 ||
        now >= (grant.until ?? Infinity)
      )
        delete session.grants[Number(key)];
    for (const key of Object.keys(session.pauses))
      if (!tabs.some((t) => t.id === Number(key))) delete session.pauses[Number(key)];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 29);
    for (const date of Object.keys(usage)) if (date < day(cutoff)) delete usage[date];
    const rules: Parameters<
      typeof browser.declarativeNetRequest.updateDynamicRules
    >[0]["addRules"] = [];
    const allowances: typeof rules = [];
    let id = 1,
      allowId = 100000;
    for (const site of settings.sites) {
      const policy = policyFor(site);
      const blocked =
        policy.mode === "block" ||
        (policy.mode === "limit" && (usage[day()]?.[site.id] ?? 0) >= policy.minutes * 60000);
      for (const target of site.targets) {
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regexFilter = `^https?://([^/]+\\.)?${escaped}([/?#].*)?$`;
        const priority = target.length * 10;
        rules.push({
          id: id++,
          priority: priority + (blocked ? 2 : 0),
          action:
            blocked || policy.pause
              ? {
                  type: "redirect",
                  redirect: {
                    regexSubstitution: browser.runtime.getURL("/gate.html") + "#\\0",
                  },
                }
              : { type: "allow" },
          condition: { regexFilter, resourceTypes: ["main_frame"] },
        });
        if (!blocked)
          for (const [tabId, grant] of Object.entries(session.grants))
            if (grant.site === site.id)
              allowances.push({
                id: allowId++,
                priority: priority + 1,
                action: { type: "allow" },
                condition: {
                  tabIds: [Number(tabId)],
                  regexFilter,
                  resourceTypes: ["main_frame"],
                },
              });
      }
      for (const tab of tabs) {
        if (tab.id === undefined || siteFor(tab.url ?? "", settings.sites)?.id !== site.id)
          continue;
        if (blocked || (policy.pause && session.grants[tab.id]?.site !== site.id)) {
          active.delete(site.id);
          await browser.tabs.update(tab.id, {
            url: browser.runtime.getURL("/gate.html") + "#" + tab.url,
          });
        }
      }
    }
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: (await browser.declarativeNetRequest.getDynamicRules()).map((r) => r.id),
      addRules: rules,
    });
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: (await browser.declarativeNetRequest.getSessionRules()).map((r) => r.id),
      addRules: allowances,
    });
    await browser.storage.local.set({ usage });
    await browser.storage.session.set({
      runtime: { ...session, active: [...active], checkpoint: now },
    });
  }
  const run = () => {
    void serialize(reconcile);
  };
  browser.runtime.onMessage.addListener((message, sender) =>
    serialize(async () => {
      if (
        sender.tab?.id === undefined ||
        !sender.url?.startsWith(browser.runtime.getURL("/gate.html") + "#") ||
        !message ||
        typeof message.url !== "string" ||
        sender.url.slice(sender.url.indexOf("#") + 1) !== message.url
      )
        return;
      await reconcile();
      const { settings, usage, session } = await state();
      const site = siteFor(message.url, settings.sites);
      if (!site) return { blocked: true };
      const policy = policyFor(site);
      const blocked =
        policy.mode === "block" ||
        (policy.mode === "limit" && (usage[day()]?.[site.id] ?? 0) >= policy.minutes * 60000);
      if (blocked) return { blocked: true };
      const id = sender.tab.id;
      if (message.type === "pause") {
        // Reloading the gate keeps its nudge, so the breathing wait can't be re-rolled away.
        if (session.pauses[id]?.url !== message.url) {
          const nudge = pickNudge(settings.nudges, session.lastNudge);
          session.pauses[id] = { url: message.url, since: Date.now(), nudge };
          session.lastNudge = nudge;
        }
        await browser.storage.session.set({ runtime: session });
        return { blocked: false, nudge: session.pauses[id]!.nudge };
      }
      const pause = session.pauses[id];
      const minutes = [5, 15, 30].includes(message.minutes) ? (message.minutes as number) : 0;
      if (
        message.type === "continue" &&
        pause !== undefined &&
        pause.url === message.url &&
        (pause.nudge !== "breathe" || Date.now() - pause.since >= 10000) &&
        (pause.nudge !== "duration" || minutes)
      ) {
        session.grants[id] = {
          site: site.id,
          last: Date.now(),
          ...(minutes && { until: Date.now() + minutes * 60000 }),
        };
        delete session.pauses[id];
        await browser.storage.session.set({ runtime: session });
        await reconcile();
        await browser.tabs.update(id, { url: message.url });
      }
    }),
  );
  browser.alarms.create("checkpoint", { periodInMinutes: 0.5 });
  browser.alarms.onAlarm.addListener(run);
  browser.tabs.onActivated.addListener(run);
  browser.tabs.onUpdated.addListener(run);
  browser.tabs.onRemoved.addListener(run);
  browser.windows.onFocusChanged.addListener(run);
  browser.idle.onStateChanged.addListener(run);
  browser.webNavigation.onHistoryStateUpdated.addListener(run);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(run);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) run();
  });
  browser.permissions.onRemoved.addListener(run);
  browser.runtime.onStartup.addListener(() => {
    void serialize(async () => {
      await browser.storage.session.clear();
      await reconcile();
    });
  });
  run();
});
