<script setup lang="ts">
import { useConfirm } from '../../composables/useConfirm'
import AppDialog from './AppDialog.vue'
import AppButton from './AppButton.vue'

const { state, accept, cancel } = useConfirm()
</script>

<template>
  <AppDialog
    :open="state.open"
    :title="state.title"
    :description="state.description"
    width="420px"
    @update:open="(value) => !value && cancel()"
  >
    <div class="text-[13px] leading-relaxed text-ink-2">
      <slot />
    </div>
    <template #footer>
      <AppButton variant="ghost" @click="cancel">{{ state.cancelLabel }}</AppButton>
      <AppButton :variant="state.tone === 'danger' ? 'danger' : 'primary'" @click="accept">
        {{ state.confirmLabel }}
      </AppButton>
    </template>
  </AppDialog>
</template>
