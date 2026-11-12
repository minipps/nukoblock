<script setup lang="ts">
import { ref } from "vue";
import type { Site, Policy } from "./model";
const props = defineProps<{ site: Site }>();
const emit = defineEmits<{ save: [] }>();
const days = ref([1, 2, 3, 4, 5]),
  start = ref("09:00"),
  end = ref("17:00"),
  mode = ref<Policy["mode"]>("block"),
  minutes = ref(60),
  error = ref("");
const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Window = Site["windows"][number];
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
    <summary>Weekly schedule ({{ site.windows.length }})</summary>
    <p v-for="(w, i) in site.windows" :key="i">
      {{ w.days.map((d) => names[d]).join(", ") }} {{ w.start }}–{{ w.end }}:
      {{ w.policy.mode }}
      {{ w.policy.mode === "limit" ? w.policy.minutes + " min" : ""
      }}<button
        @click="
          site.windows.splice(i, 1);
          emit('save');
        "
      >
        Remove window
      </button>
    </p>
    <fieldset>
      <legend>Days</legend>
      <label v-for="(name, i) in names" :key="name"
        ><input v-model="days" type="checkbox" :value="i" />{{ name }}</label
      >
    </fieldset>
    <label>Start<input v-model="start" type="time" /></label
    ><label>End<input v-model="end" type="time" /></label
    ><label
      >Override<select v-model="mode">
        <option value="block">Block</option>
        <option value="track">Track only</option>
        <option value="limit">Daily limit</option>
      </select></label
    ><label v-if="mode === 'limit'"
      >Daily minutes<input v-model.number="minutes" type="number" min="1" /></label
    ><button @click="add">Add window</button>
    <p role="alert">{{ error }}</p>
  </details>
</template>
