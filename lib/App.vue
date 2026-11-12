<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { browser } from "wxt/browser";
import {
  bar,
  defaults,
  validateSettings,
  normalize,
  policyFor,
  siteFor,
  day,
  nudges,
  type Nudge,
  type Settings,
  type Site,
} from "./model";
import Cat from "./Cat.vue";
import Schedule from "./Schedule.vue";
import "./style.css";
const props = defineProps<{ page: string }>();
const settings = ref<Settings>(structuredClone(defaults));
const usage = ref<Record<string, Record<string, number>>>({});
const input = ref(""),
  error = ref(""),
  blocked = ref(true),
  seconds = ref(10),
  saved = ref(false),
  tab = ref<"sites" | "stats" | "look">("sites"),
  nudge = ref<Nudge>("breathe"),
  feeling = ref(""),
  suggestions = ref<string[]>([]),
  alternative = ref(""),
  current = ref("");
const nudgeNames: Record<Nudge, string> = {
  breathe: "breathe",
  elsewhere: "do this instead",
  feeling: "how do you feel?",
  duration: "how long?",
};
const questions: Record<Nudge, string> = {
  breathe: "What brought you here?",
  elsewhere: "Why not focus elsewhere?",
  feeling: "How are you feeling?",
  duration: "How long do you want to stay?",
};
const feelings: Record<string, string> = {
  curious: "Curious is good. Find your answer, then come back to me.",
  tired: "Maybe a nap would help more than a scroll? zZz",
  bored: "Boredom is where the good ideas start.",
  lonely: "Someone would love to hear from you right now.",
  social: "A real chat might beat the feed.",
  stressed: "Stretch with me first? I'll wait.",
  inspired: "Ooh! Make something with that spark.",
  productive: "Nice. Keep it short and sweet.",
};
const period = ref(7);
const banner = [
  "█▄  █ █   █ █  ▄▀ ▄▀▀▀▄ █▀▀▀▄ █     ▄▀▀▀▄ ▄▀▀▀▀ █  ▄▀",
  "█ ▀▄█ █   █ █▀▀▄  █   █ █▀▀▀▄ █     █   █ █     █▀▀▄",
  "▀   ▀  ▀▀▀  ▀   ▀  ▀▀▀  ▀▀▀▀  ▀▀▀▀▀  ▀▀▀   ▀▀▀▀ ▀   ▀",
].join("\n");
const modes = [
  { value: "track", label: "track", hint: "count the time. never interrupts." },
  {
    value: "limit",
    label: "limit",
    hint: "daily budget. blocked once it runs out, resets at midnight.",
  },
  { value: "block", label: "block", hint: "always blocked." },
] as const;
const themes: Record<string, Settings["colors"]> = {
  mocha: { ...defaults.colors },
  latte: { background: "#eff1f5", surface: "#ccd0da", text: "#4c4f69", accent: "#8839ef" },
  phosphor: { background: "#070d07", surface: "#132013", text: "#8dff9a", accent: "#33ff66" },
  amber: { background: "#120c02", surface: "#271c07", text: "#ffd27a", accent: "#ffb000" },
  sakura: { background: "#24192a", surface: "#3b2a42", text: "#f6e3ef", accent: "#ff8fbf" },
};
const contrast = computed(() => {
  const a = luminance(settings.value.colors.text ?? "#cdd6f4"),
    b = luminance(settings.value.colors.background ?? "#1e1e2e");
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
const permissions = ref<Record<string, boolean>>({});
async function refreshPermissions() {
  for (const site of settings.value.sites)
    permissions.value[site.id] = await browser.permissions.contains({
      origins: site.targets.flatMap((t) => [
        `https://*.${t.split("/")[0]}/*`,
        `http://*.${t.split("/")[0]}/*`,
      ]),
    });
}
const split = (text: string) => text.split(separators).filter(Boolean);
const preview = computed(() => {
  try {
    return split(input.value).map(normalize).join("  ");
  } catch {
    return "";
  }
});
const destination = location.hash.slice(1);
const host = URL.canParse(destination) ? new URL(destination).hostname : "";
const watching = computed(() => !!siteFor(current.value, settings.value.sites));
// Whole domain, not the page path, minus "www." so subdomains like m. match too.
const currentHost = computed(() =>
  URL.canParse(current.value) && web.test(current.value)
    ? new URL(current.value).hostname.replace(www, "")
    : "",
);
const addBox = useTemplateRef<HTMLInputElement>("addBox");
// Site access is requested from the options tab: a prompt raised from the popup gets
// covered by it in Firefox, and the popup may close before the answer arrives.
function addFromPopup() {
  void browser.tabs.create({
    url: browser.runtime.getURL("/options.html") + "#add=" + encodeURIComponent(currentHost.value),
  });
  window.close();
}
const siteToday = computed(() => {
  const site = siteFor(destination, settings.value.sites);
  return site ? minutes(today.value[site.id] ?? 0) : 0;
});
const href = (a: string) => (linkish.test(a) ? (a.includes("://") ? a : `https://${a}`) : "");
function proceed(minutes?: number) {
  void browser.runtime.sendMessage({ type: "continue", url: destination, minutes });
}
function addAlternative() {
  const text = alternative.value.trim();
  if (!text) return;
  settings.value.alternatives.push(text.slice(0, 200));
  alternative.value = "";
  void save();
}
const presets = [
  { name: "YouTube", targets: ["youtube.com", "youtu.be"] },
  { name: "Reddit", targets: ["reddit.com"] },
  { name: "Instagram", targets: ["instagram.com"] },
  { name: "Twitter / X", targets: ["x.com", "twitter.com"] },
  { name: "TikTok", targets: ["tiktok.com"] },
];
const theme = computed(() => ({
  ...Object.fromEntries(Object.entries(settings.value.colors).map(([k, v]) => ["--" + k, v])),
  colorScheme: luminance(settings.value.colors.background ?? "#000000") > 0.4 ? "light" : "dark",
}));
const today = computed(() => usage.value[day()] ?? {});
const total = computed(() => Object.values(today.value).reduce((a, b) => a + b, 0));
const history = computed(() =>
  Array.from({ length: period.value }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ms = Object.values(usage.value[day(d)] ?? {}).reduce((a, b) => a + b, 0);
    return { date: day(d), weekday: d.toLocaleDateString(undefined, { weekday: "short" }), ms };
  }),
);
const peak = computed(() => Math.max(60000, ...history.value.map((h) => h.ms)));
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  const stored = await browser.storage.local.get(["settings", "usage"]);
  settings.value = validateSettings(stored.settings ?? structuredClone(defaults));
  usage.value = (stored.usage as typeof usage.value) ?? {};
  await refreshPermissions();
  if (props.page === "popup")
    current.value = (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? "";
  if (props.page === "options" && location.hash.startsWith("#add=")) {
    input.value = decodeURIComponent(location.hash.slice(5));
    window.history.replaceState(null, "", location.pathname);
    addBox.value?.focus();
  }
  if (props.page === "gate") {
    const result = await browser.runtime.sendMessage({
      type: "pause",
      url: destination,
    });
    blocked.value = result?.blocked !== false;
    nudge.value = result?.nudge ?? "breathe";
    suggestions.value = settings.value.alternatives.toSorted(() => Math.random() - 0.5).slice(0, 3);
    timer = setInterval(() => {
      if (document.visibilityState === "visible") seconds.value = Math.max(0, seconds.value - 1);
    }, 1000);
  }
});
onUnmounted(() => clearInterval(timer));
async function save() {
  await browser.storage.local.set({
    settings: validateSettings(JSON.parse(JSON.stringify(settings.value))),
  });
  await refreshPermissions();
  saved.value = true;
  setTimeout(() => (saved.value = false), 1500);
}
async function add(text: string, group = false) {
  try {
    const targets = [...new Set(split(text).map(normalize))];
    if (!targets.length) throw Error("Enter at least one domain or URL.");
    const origins = targets.flatMap((t) => [
      `https://*.${t.split("/")[0]}/*`,
      `http://*.${t.split("/")[0]}/*`,
    ]);
    if (!(await browser.permissions.request({ origins }))) throw Error("Site access is required.");
    const fresh = targets.filter((t) => !settings.value.sites.some((s) => s.targets.includes(t)));
    const groups = group ? [fresh] : fresh.map((t) => [t]);
    for (const list of groups)
      if (list.length)
        settings.value.sites.push({
          id: crypto.randomUUID(),
          targets: list,
          policy: { mode: "limit", minutes: 30, pause: true },
          windows: [],
        });
    await save();
    input.value = "";
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
}
const added = (targets: string[]) =>
  targets.every((t) => settings.value.sites.some((s) => s.targets.includes(t)));
function remove(site: Site) {
  if (!confirm(`Stop watching ${site.targets.join(", ")}?`)) return;
  settings.value.sites = settings.value.sites.filter((s) => s.id !== site.id);
  void save();
}
async function leave() {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
}
async function clearStats() {
  if (confirm("Clear all usage statistics?")) {
    await browser.storage.local.set({ usage: {} });
    usage.value = {};
  }
}
function minutes(ms: number) {
  return Math.round(ms / 60000);
}
function updatePolicy(site: Site) {
  if (!Number.isFinite(site.policy.minutes) || site.policy.minutes < 1) site.policy.minutes = 1;
  void save();
}
function status(site: Site) {
  const p = policyFor(site),
    used = minutes(today.value[site.id] ?? 0);
  const note = p === site.policy ? "" : " · schedule";
  if (p.mode === "block") return { meter: bar(1, 1, 16), text: `blocked${note}` };
  if (p.mode === "track") return { meter: "", text: `${used} min tracked${note}` };
  return { meter: bar(used, p.minutes, 16), text: `${used}/${p.minutes} min${note}` };
}
</script>
<template>
  <div class="app" :class="page" :style="theme">
    <!-- ───────────── gate ───────────── -->
    <main v-if="page === 'gate'" class="gate">
      <p class="bubble" role="status">
        {{
          blocked
            ? "Time for a little space."
            : nudge === "feeling" && feeling
              ? feelings[feeling]
              : questions[nudge]
        }}
      </p>
      <Cat />
      <h1 class="sr-only">Nukoblock</h1>
      <p class="dim">
        <span v-if="host">&gt; {{ host }} · {{ siteToday }} min today · </span>
        {{ blocked ? "blocked by your current policy" : "take a moment before you decide" }}
      </p>
      <template v-if="!blocked">
        <p v-if="nudge === 'breathe'" class="breath" aria-live="off">
          <span class="meter">{{ bar(10 - seconds, 10) }}</span>
          {{ seconds ? (seconds % 4 < 2 ? "…and out" : "breathe in…") : "ready" }}
        </p>
        <template v-else-if="nudge === 'elsewhere'">
          <ul class="list suggestions">
            <li v-for="a in suggestions" :key="a">
              <a v-if="href(a)" :href="href(a)">{{ a }} ↗</a><span v-else>{{ a }}</span>
            </li>
          </ul>
          <p class="dim">pick your own in settings → nudges.</p>
        </template>
        <template v-else-if="nudge === 'feeling'">
          <p class="breath">
            i'm opening <strong>{{ host || "this" }}</strong> because i feel
            <span class="blank">{{ feeling || "________" }}</span>
          </p>
          <div class="row center chips">
            <button
              v-for="(_, f) in feelings"
              :key="f"
              :aria-pressed="feeling === f"
              @click="feeling = f"
            >
              {{ f }}
            </button>
          </div>
        </template>
        <template v-else>
          <div class="row center chips">
            <button v-for="m in [5, 15, 30]" :key="m" class="big" @click="proceed(m)">
              {{ m }} min
            </button>
          </div>
          <p class="dim">the cat comes back when your time is up.</p>
        </template>
      </template>
      <div class="row center">
        <button class="primary" @click="leave">leave</button>
        <button
          v-if="!blocked && nudge !== 'duration'"
          :disabled="nudge === 'breathe' ? seconds > 0 : nudge === 'feeling' && !feeling"
          @click="proceed()"
        >
          {{ nudge === "breathe" && seconds ? `continue in ${seconds}s` : "continue" }}
        </button>
        <button @click="browser.runtime.openOptionsPage()">settings</button>
      </div>
    </main>

    <!-- ───────────── popup ───────────── -->
    <main v-else-if="page === 'popup'">
      <header class="top">
        <h1><span class="prompt">nukoblock</span><span class="cursor">_</span></h1>
        <span class="dim">{{ minutes(total) }} min today</span>
      </header>
      <Cat />
      <ul class="list">
        <li v-if="!settings.sites.length" class="dim">no sites watched yet. purr.</li>
        <li v-for="site in settings.sites" :key="site.id">
          <span class="name">{{ site.targets[0] }}</span>
          <span class="dim">{{ status(site).text }}</span>
          <span v-if="status(site).meter" class="meter wide">{{ status(site).meter }}</span>
        </li>
      </ul>
      <p v-if="error" role="alert" class="warn">! {{ error }}</p>
      <div class="row">
        <button class="primary" :disabled="watching || !currentHost" @click="addFromPopup">
          {{ watching ? "✓ watching" : "+ this site" }}
        </button>
        <button @click="browser.runtime.openOptionsPage()">settings</button>
      </div>
    </main>

    <!-- ───────────── options ───────────── -->
    <main v-else class="options">
      <header class="hero">
        <Cat />
        <div>
          <h1 class="banner">
            <span aria-hidden="true">{{ banner }}</span><span class="sr-only">Nukoblock</span>
          </h1>
          <p>your time, intentionally.<span class="cursor">_</span></p>
          <p class="dim">
            today: <span class="meter">{{ bar(total, peak, 16) }}</span> {{ minutes(total) }} min
          </p>
        </div>
      </header>

      <nav class="tabs" role="tablist">
        <button
          v-for="t in ['sites', 'stats', 'look'] as const"
          :key="t"
          role="tab"
          :aria-selected="tab === t"
          @click="tab = t"
        >
          {{ t }}
        </button>
        <span class="saved" role="status">{{ saved ? "✓ saved" : "" }}</span>
      </nav>

      <template v-if="tab === 'sites'">
        <section class="panel">
          <h2>add a site</h2>
          <form class="row" @submit.prevent="add(input)">
            <input
              ref="addBox"
              v-model="input"
              class="grow"
              aria-label="Domains or URL paths"
              placeholder="youtube.com/shorts, news.site.com"
            />
            <button class="primary" type="submit">add</button>
          </form>
          <p v-if="input" class="dim">
            → {{ preview || "enter HTTP(S) domains or paths, separated by spaces or commas" }}
          </p>
          <p class="dim">or one click:</p>
          <div class="row">
            <button
              v-for="preset in presets"
              :key="preset.name"
              :disabled="added(preset.targets)"
              @click="add(preset.targets.join(' '), true)"
            >
              {{ added(preset.targets) ? "✓" : "+" }} {{ preset.name }}
            </button>
          </div>
          <p v-if="error" role="alert" class="warn">! {{ error }}</p>
          <p class="dim">new sites start with a 30 min daily limit and a nudge before entering.</p>
        </section>

        <section class="panel">
          <h2>nudges</h2>
          <p class="dim">before a site with a pause opens, the cat picks one of these:</p>
          <fieldset class="row">
            <legend>use</legend>
            <label v-for="n in nudges" :key="n" class="tick chip">
              <input v-model="settings.nudges" type="checkbox" :value="n" @change="save" /><span>{{
                nudgeNames[n]
              }}</span>
            </label>
          </fieldset>
          <p v-if="!settings.nudges.length" class="dim">
            none picked, so the cat will just breathe.
          </p>
          <h3>things to do instead</h3>
          <ul class="list">
            <li v-for="(a, i) in settings.alternatives" :key="a + i">
              <span class="grow">{{ a }}</span>
              <button
                class="danger"
                @click="
                  settings.alternatives.splice(i, 1);
                  save();
                "
              >
                remove
              </button>
            </li>
          </ul>
          <form class="row" @submit.prevent="addAlternative">
            <input
              v-model="alternative"
              class="grow"
              maxlength="200"
              aria-label="Something to do instead"
              placeholder="call a friend, duolingo.com, …"
            />
            <button type="submit">add</button>
          </form>
        </section>

        <section class="panel">
          <h2>watched sites ({{ settings.sites.length }})</h2>
          <p v-if="!settings.sites.length" class="dim">nothing here yet. the cat is bored.</p>
          <article v-for="site in settings.sites" :key="site.id" class="site">
            <header class="row">
              <strong class="grow">&gt; {{ site.targets.join(", ") }}</strong>
              <button class="danger" @click="remove(site)">remove</button>
            </header>
            <p v-if="permissions[site.id] === false" role="alert" class="warn">
              ! site access missing. remove and re-add this entry to grant it.
            </p>
            <p><span class="meter">{{ status(site).meter }}</span> {{ status(site).text }}</p>
            <fieldset class="row">
              <legend>policy</legend>
              <label v-for="m in modes" :key="m.value" class="tick chip">
                <input
                  v-model="site.policy.mode"
                  type="radio"
                  :name="`mode-${site.id}`"
                  :value="m.value"
                  @change="updatePolicy(site)"
                /><span>{{ m.label }}</span>
              </label>
            </fieldset>
            <p class="dim">{{ modes.find((m) => m.value === site.policy.mode)?.hint }}</p>
            <div v-if="site.policy.mode === 'limit'" class="row">
              <label
                >minutes/day
                <input
                  v-model.number="site.policy.minutes"
                  type="number"
                  min="1"
                  @change="updatePolicy(site)"
              /></label>
              <button
                v-for="n in [15, 30, 60, 120]"
                :key="n"
                :aria-pressed="site.policy.minutes === n"
                @click="
                  site.policy.minutes = n;
                  updatePolicy(site);
                "
              >
                {{ n }}
              </button>
            </div>
            <label class="tick">
              <input v-model="site.policy.pause" type="checkbox" @change="save" /><span
                >pause with a nudge before entering</span
              >
            </label>
            <Schedule :site="site" @save="save" />
          </article>
        </section>
      </template>

      <section v-else-if="tab === 'stats'" class="panel">
        <h2>statistics</h2>
        <fieldset class="row">
          <legend>period</legend>
          <label v-for="n in [7, 30]" :key="n" class="tick chip">
            <input v-model="period" type="radio" name="period" :value="n" /><span
              >{{ n }} days</span
            >
          </label>
        </fieldset>
        <pre
          class="chart"
        ><template v-for="h in history" :key="h.date"><span class="dim">{{ h.weekday.padEnd(4) }}{{ h.date.slice(5) }}</span> <span class="meter">{{ bar(h.ms, peak, 32) }}</span> {{ String(minutes(h.ms)).padStart(4) }} min
</template></pre>
        <h3>today by site</h3>
        <p v-if="!settings.sites.length" class="dim">no sites yet.</p>
        <pre
          class="chart"
        ><template v-for="site in settings.sites" :key="site.id">{{ site.targets[0]!.slice(0, 18).padEnd(19) }}<span class="meter">{{ bar(today[site.id] ?? 0, Math.max(60000, total), 24) }}</span> {{ String(minutes(today[site.id] ?? 0)).padStart(4) }} min
</template></pre>
        <button class="danger" @click="clearStats">clear statistics</button>
      </section>

      <section v-else class="panel">
        <h2>appearance</h2>
        <fieldset class="row">
          <legend>show time on site</legend>
          <label class="tick chip"
            ><input v-model="settings.show.badge" type="checkbox" @change="save" /><span
              >toolbar badge</span
            ></label
          >
          <label class="tick chip"
            ><input v-model="settings.show.page" type="checkbox" @change="save" /><span
              >top-right of the page</span
            ></label
          >
        </fieldset>
        <p class="dim">themes:</p>
        <div class="row">
          <button
            v-for="(colors, name) in themes"
            :key="name"
            @click="
              settings.colors = { ...colors };
              save();
            "
          >
            <span v-for="c in colors" :key="c" :style="{ color: c }">█</span> {{ name }}
          </button>
        </div>
        <p class="dim">or mix your own:</p>
        <div class="row">
          <label v-for="(value, key) in settings.colors" :key="key" class="swatch"
            ><input v-model="settings.colors[key]" type="color" @change="save" />{{ key }}</label
          >
        </div>
        <p v-if="contrast < 4.5" role="status" class="warn">
          ! text contrast is low ({{ contrast.toFixed(1) }}:1). pick a lighter text or darker
          background.
        </p>
      </section>
    </main>
    <footer>-- local to this browser. your time belongs to you. --</footer>
  </div>
</template>
<script lang="ts">
const separators = /[\s,]+/;
const web = /^https?:/;
const www = /^www\./;
const linkish = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/;
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) ?? [0, 0, 0];
  const [red = 0, green = 0, blue = 0] = channels;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
</script>
