<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { browser } from "wxt/browser";
import { defaults, validateSettings, normalize, day, type Settings, type Site } from "./model";
import Schedule from "./Schedule.vue";
import "./style.css";
const props = defineProps<{ page: string }>();
const settings = ref<Settings>(structuredClone(defaults));
const usage = ref<Record<string, Record<string, number>>>({});
const input = ref(""),
  error = ref(""),
  blocked = ref(true),
  seconds = ref(10);
const period = ref(7);
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
const preview = computed(() => {
  try {
    return input.value.split("\n").filter(Boolean).map(normalize).join(", ");
  } catch {
    return "Enter valid HTTP(S) domains or paths.";
  }
});
const destination = location.hash.slice(1);
const presets = [
  { name: "YouTube", targets: ["youtube.com", "youtu.be"] },
  { name: "Reddit", targets: ["reddit.com"] },
  { name: "Instagram", targets: ["instagram.com"] },
  { name: "Twitter / X", targets: ["x.com", "twitter.com"] },
  { name: "TikTok", targets: ["tiktok.com"] },
];
const theme = computed(() =>
  Object.fromEntries(Object.entries(settings.value.colors).map(([k, v]) => ["--" + k, v])),
);
const today = computed(() => usage.value[day()] ?? {});
const total = computed(() => Object.values(today.value).reduce((a, b) => a + b, 0));
const dates = computed(() => Object.entries(usage.value).sort(([a], [b]) => b.localeCompare(a)));
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  const stored = await browser.storage.local.get(["settings", "usage"]);
  settings.value = validateSettings(stored.settings ?? structuredClone(defaults));
  usage.value = (stored.usage as typeof usage.value) ?? {};
  await refreshPermissions();
  if (props.page === "gate") {
    const result = await browser.runtime.sendMessage({
      type: "pause",
      url: destination,
    });
    blocked.value = result?.blocked !== false;
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
}
async function add(text: string, group = false) {
  try {
    const targets = [...new Set(text.split("\n").filter(Boolean).map(normalize))];
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
function remove(site: Site) {
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
async function addCurrent() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) await add(tab.url);
}
function minutes(ms: number) {
  return Math.round(ms / 60000);
}
function updatePolicy(site: Site) {
  if (!Number.isFinite(site.policy.minutes) || site.policy.minutes < 1) site.policy.minutes = 1;
  void save();
}
</script>
<template>
  <main :style="theme">
    <header>
      <pre aria-hidden="true">
 /\_/\\
( o.o )
 &gt; ^ &lt;</pre>
      <h1>Nukoblock</h1>
    </header>
    <template v-if="page === 'gate'">
      <h2>
        {{ blocked ? "Time for a little space." : "What brought you here?" }}
      </h2>
      <p>
        {{
          blocked
            ? "This site is blocked by your current policy."
            : "Take a slow breath. Choose what you want to do next."
        }}
      </p>
      <button @click="leave">Leave</button>
      <button
        v-if="!blocked"
        :disabled="seconds > 0"
        @click="browser.runtime.sendMessage({ type: 'continue', url: destination })"
      >
        {{ seconds ? `Continue in ${seconds}s` : "Continue" }}
      </button>
      <button @click="browser.runtime.openOptionsPage()">Settings</button>
    </template>
    <template v-else>
      <h2>Your time, intentionally.</h2>
      <p>{{ minutes(total) }} minutes of tracked site time today</p>
      <template v-if="page === 'popup'">
        <p v-for="site in settings.sites" :key="site.id">
          {{ site.targets[0] }} · {{ minutes(today[site.id] ?? 0) }} min<span
            v-if="site.policy.mode === 'limit'"
          >
            / {{ site.policy.minutes }} min</span
          >
        </p>
        <button @click="addCurrent">Add current site</button
        ><button @click="browser.runtime.openOptionsPage()">Manage sites & statistics</button>
      </template>
      <template v-else>
        <h2>Sites</h2>
        <p>
          New sites start with a 30-minute daily limit and a 10-second pause. You can edit these
          below.
        </p>
        <div class="presets">
          <button
            v-for="preset in presets"
            :key="preset.name"
            @click="add(preset.targets.join('\n'), true)"
          >
            + {{ preset.name }}
          </button>
        </div>
        <label
          >Domains or URL paths, one per line<textarea
            v-model="input"
            placeholder="youtube.com/shorts"
          />
        </label>
        <p v-if="input">Targets: {{ preview }}</p>
        <button @click="add(input)">Add sites</button>
        <section v-for="site in settings.sites" :key="site.id">
          <strong>{{ site.targets.join(", ") }}</strong>
          <p v-if="permissions[site.id] === false" role="alert">
            Site access is missing. Remove and re-add this entry to grant access.
          </p>
          <p>{{ minutes(today[site.id] ?? 0) }} minutes today</p>
          <label
            >Policy<select v-model="site.policy.mode" @change="updatePolicy(site)">
              <option value="track">Track only</option>
              <option value="limit">Daily limit</option>
              <option value="block">Block</option>
            </select></label
          >
          <label v-if="site.policy.mode === 'limit'"
            >Minutes per day<input
              v-model.number="site.policy.minutes"
              type="number"
              min="1"
              @change="updatePolicy(site)"
          /></label>
          <label
            ><input v-model="site.policy.pause" type="checkbox" @change="save" />10-second entry
            pause</label
          >
          <Schedule :site="site" @save="save" /><button @click="remove(site)">Remove site</button>
        </section>
        <h2>Statistics</h2>
        <label
          >Period<select v-model="period">
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
          </select></label
        >
        <p v-for="[date, values] in dates.slice(0, period)" :key="date">
          {{ date }} · {{ minutes(Object.values(values).reduce((a, b) => a + b, 0)) }} min
          <meter
            min="0"
            max="1440"
            :value="minutes(Object.values(values).reduce((a, b) => a + b, 0))"
            :aria-label="`Usage on ${date}`"
          />
        </p>
        <button @click="clearStats">Clear statistics</button>
        <h2>Appearance</h2>
        <label v-for="(value, key) in settings.colors" :key="key"
          >{{ key }}<input v-model="settings.colors[key]" type="color" @change="save"
        /></label>
        <p v-if="contrast < 4.5" role="status">
          Text contrast is low. Choose a lighter text or darker background color.
        </p>
        <button
          @click="
            settings.colors = { ...defaults.colors };
            save();
          "
        >
          Reset Mocha
        </button>
      </template>
      <p role="alert">{{ error }}</p>
    </template>
    <footer>Local to this browser. Your time belongs to you.</footer>
  </main>
</template>
<script lang="ts">
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
