<script setup lang="ts">
import TopBar from './TopBar.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'

withDefaults(defineProps<{ searchable?: boolean }>(), { searchable: true })
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-canvas">
    <TopBar :searchable="searchable" />
    <div class="flex min-h-0 flex-1">
      <slot />
    </div>
    <ConfirmDialog />
  </div>
</template>
