<template>
  <div w-full relative>
    <div ref="el" w-full class="ghs-scroller" relative>
      <slot></slot>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  const props = defineProps({ maxHeight: String, color: String });
  const maxHeight = computed(() => props.maxHeight || '30vh');
  const el = ref<HTMLDivElement>();
</script>

<style scoped lang="less">
  .ghs-scroller {
    overflow: auto;
    height: v-bind(maxHeight);
  }
  .scroller-container {
    height: v-bind(maxHeight);
  }
  @keyframes downAndUp {
    0% {
      transform: translateX(-50%) translateY(-10%);
    }
    100% {
      transform: translateX(-50%);
    }
  }
  .ghs-scroller-icon {
    left: 50%;
    pointer-events: none;
    transform: translateX(-50%);
    animation: downAndUp 0.3s linear infinite;
  }
  .v-enter-active,
  .v-leave-active {
    transition: opacity 0.3s ease;
  }

  .v-enter-from,
  .v-leave-to {
    opacity: 0;
  }
</style>
