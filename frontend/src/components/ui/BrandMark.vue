<script setup lang="ts">
import { useId } from 'vue'

/**
 * 品牌标记：透明底的「Kv」单字组合。
 * K 为自上而下的渐变描边（品牌色渐隐），v 用同色更低透明度形成层次；
 * 尺寸由外部 class 控制，描边颜色跟随 currentColor。
 *
 * 注意：渐变必须用 userSpaceOnUse —— 竖笔画的外接框宽度为 0，
 * objectBoundingBox 坐标系会让该笔画整条不渲染。
 */
const gradientId = `brand-mark-${useId()}`
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="block">
    <defs>
      <linearGradient :id="gradientId" gradientUnits="userSpaceOnUse" x1="4" y1="3" x2="14" y2="21">
        <stop offset="0" stop-color="currentColor" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0.78" />
      </linearGradient>
    </defs>

    <!-- K -->
    <g
      :stroke="`url(#${gradientId})`"
      stroke-width="2.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3.6 4.4v15.2" />
      <path d="M12.4 4.4 3.8 12.2" />
      <path d="M5.2 10.4 12.6 19.6" />
    </g>

    <!-- v：同色更低不透明度，做出前后层次 -->
    <path
      d="m14 11 3.3 8.6 3.3-8.6"
      stroke="currentColor"
      stroke-opacity="0.68"
      stroke-width="2.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
