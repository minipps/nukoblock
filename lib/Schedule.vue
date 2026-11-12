<script setup lang="ts">
import { computed, ref } from "vue";
import { policyFor, type Site, type Policy } from "./model";
const props = defineProps<{ site: Site }>();
const emit = defineEmits<{ save: [] }>();
const days = ref([1, 2, 3, 4, 5]),
  start = ref("09:00"),
  end = ref("17:00"),
  mode = ref<Policy["mode"]>("block"),
  minutes = ref(60),
  error = ref("");
const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const glyph = { block: "█", limit: "▒", track: "░" };
const quick = { weekdays: [1, 2, 3, 4, 5], weekend: [0, 6], "every day": [0, 1, 2, 3, 4, 5, 6] };
type Window = Site["windows"][number];
// One row per weekday, one cell per hour; 2024-01-07 is a Sunday.
const timeline = computed(() =>
  names.map((name, d) => {
    let row = "";
    for (let h = 0; h < 24; h++) {
      const p = policyFor(props.site, new Date(2024, 0, 7 + d, h));
      row += p === props.site.policy ? "·" : glyph[p.mode];
    }
    return `${name} ${row}`;
  }),
);
function label(w: Window) {
  const key = Object.entries(quick).find(([, v]) => v.join() === w.days.toSorted().join())?.[0];
  return key ?? w.days.map((d) => names[d]).join(" ");
}
function slots(w: Window) {
  const result = new Set<number>();
  const a = Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3)),
    b = Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3));
  for (const d of w.days)
    for (let m = a; m < (b > a ? b : b + 1440); m++) result.add((d * 1440 + m) % 10080);
  return result;
}
function add() {
  if (
    !days.value.length ||
    !start.value ||
    !end.value ||
    start.value === end.value ||
    !Number.isFinite(minutes.value) ||
    minutes.value < 1
  ) {
    error.value = "Choose days, distinct times and a positive allowance.";
    return;
  }
  const w: Window = {
    days: [...days.value],
    start: start.value,
    end: end.value,
    policy: {
      mode: mode.value,
      minutes: minutes.value,
      pause: props.site.policy.pause,
    },
  };
  const occupied = slots(w);
  if (props.site.windows.some((x) => [...slots(x)].some((m) => occupied.has(m)))) {
    error.value = "This window overlaps another schedule.";
    return;
  }
  props.site.windows.push(w);
  emit("save");
  error.value = "";
}
</script>
<template>
  <details>
    <summary>weekly schedule ({{ site.windows.length }})</summary>
    <pre class="chart"><span class="dim">    0     6     12    18</span>
<span v-for="row in timeline" :key="row" class="meter">{{ row }}
</span><span class="dim">· default  █ block  ▒ limit  ░ track</span></pre>
    <ul class="list">
      <li v-for="(w, i) in site.windows" :key="i">
        <span class="grow"
          >{{ label(w) }} {{ w.start }}–{{ w.end }} → {{ w.policy.mode }}
          {{ w.policy.mode === "limit" ? w.policy.minutes + " min" : "" }}</span
        ><button
          class="danger"
          @click="
            site.windows.splice(i, 1);
            emit('save');
          "
        >
          remove
        </button>
      </li>
    </ul>
    <fieldset class="row">
      <legend>days</legend>
      <label v-for="(name, i) in names" :key="name" class="tick chip"
        ><input v-model="days" type="checkbox" :value="i" /><span>{{ name }}</span></label
      >
      <button v-for="(v, k) in quick" :key="k" @click="days = [...v]">{{ k }}</button>
    </fieldset>
    <div class="row">
      <label>from <input v-model="start" type="time" /></label>
      <label>to <input v-model="end" type="time" /></label>
    </div>
    <fieldset class="row">
      <legend>during this window</legend>
      <label v-for="m in ['block', 'limit', 'track'] as const" :key="m" class="tick chip"
        ><input v-model="mode" type="radio" :name="`window-${site.id}`" :value="m" /><span>{{
          m
        }}</span></label
      >
      <label v-if="mode === 'limit'">
        <input v-model.number="minutes" type="number" min="1" aria-label="Daily minutes" /> min
      </label>
    </fieldset>
    <button class="primary" @click="add">+ add window</button>
    <p v-if="error" role="alert" class="warn">! {{ error }}</p>
  </details>
</template>
