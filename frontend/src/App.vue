<script setup lang="ts">
import ToastHost from './components/ui/ToastHost.vue'
import AppTooltip from './components/ui/AppTooltip.vue'
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      enter-from-class="opacity-0"
      mode="out-in"
    >
      <component :is="Component" />
    </Transition>
  </RouterView>
  <ToastHost />
  <AppTooltip />
</template>
