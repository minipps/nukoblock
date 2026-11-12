<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
// Lines 10 and 11 end with the swaying tail tip, eyes are the @@@ placeholders.
const body = [
  "          .-.           .-.",
  "         /   \\         /   \\",
  "        |  .  '-------'  .  |",
  "       /                     \\",
  "      |                       |",
  "      |     @@@       @@@     |",
  "    --|-          w          -|--",
  "    --|-  ///           ///  -|--",
  "       \\                     /",
  "        '-._             _.-'",
  "           /'-----------'\\",
  "          |               |",
  "          |   _       _   |     /  /",
  "           \\ ( )     ( ) /_____/  /",
  "            '-'-------'-'-------'",
];
const tails = [
  ["        __", "      /  )"],
  ["       _", "     (  \\"],
];
const tick = ref(1);
const art = computed(() => {
  const [a, b] = tails[Math.floor(tick.value / 6) % 2]!;
  const eyes = tick.value % 20 === 0 ? " ^ " : "(o)";
  return body
    .map((line, i) => (i === 10 ? line + a : i === 11 ? line + b : line))
    .join("\n")
    .replaceAll("@@@", eyes);
});
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    timer = setInterval(() => tick.value++, 250);
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <pre class="cat" aria-hidden="true">{{ art }}</pre>
</template>
