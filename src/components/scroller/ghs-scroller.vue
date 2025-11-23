<template>
  <div w-full relative>
    <div ref="el" w-full class="ghs-scroller" relative>
      <slot></slot>
    </div>
    <transition>
      <div
        v-if="!arrivedState.bottom && show"
        absolute
        flex
        justify-center
        items-center
        bottom-2
        class="ghs-scroller-icon"
      >
        <DownCircleOutlined />
      </div>
    </transition>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { ref, watch } from 'vue-demi';
  import { useElementSize, useScroll } from '@vueuse/core';
  import { DownCircleOutlined } from '@ant-design/icons-vue';

  const props = defineProps({ maxHeight: String, color: String });
  const maxHeight = computed(() => props.maxHeight || '30vh');
  const el = ref<HTMLDivElement>();
  const { arrivedState } = useScroll(el);
  const { height } = useElementSize(el);
  const colorComp = computed(() => props.color || '#333');
  const show = ref(true);
  const judgeScroll = () => {
    show.value = el?.value?.scrollHeight > el?.value?.clientHeight;
  };

  watch(height, () => {
    judgeScroll();
  });
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
