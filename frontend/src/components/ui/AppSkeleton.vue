<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number
    height?: string
    rounded?: string
  }>(),
  { rows: 3, height: '12px', rounded: '6px' },
)
</script>

<template>
  <div class="flex flex-col gap-2.5" aria-hidden="true">
    <div
      v-for="row in rows"
      :key="row"
      class="shimmer"
      :style="{
        height,
        borderRadius: rounded,
        width: row === rows && rows > 1 ? '62%' : '100%',
      }"
    />
  </div>
</template>
