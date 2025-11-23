<template>
  <teleport to="body">
    <div v-if="showRef" class="dialog-container" v-bind="$attrs" @click="handleClick">
      <div w-full h-full absolute top-0 left-0 z-1 bg-black opacity-70></div>
      <div absolute top-0 w-full style="z-index: 10001" @click.prevent.stop="() => 1">
        <slot name="headerRightTag"></slot>
        <slot name="series"></slot>
      </div>
      <transition
        enter-active-class="animate__animated animate__slideInDown"
        leave-active-class="animate__animated animate__slideOutDown"
      >
        <div class="dialog-body" @click.prevent.stop="() => 1">
          <slot></slot>
        </div>
      </transition>
    </div>
  </teleport>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue';

  const props = defineProps({ show: Boolean });
  const emit = defineEmits(['update:show']);

  const showRef = ref(false);
  const handleClick = () => {
    showRef.value = false;
    emit('update:show', false);
  };

  watch(
    () => props.show,
    () => {
      showRef.value = props.show;
    }
  );
</script>

<style scoped lang="less">
  .dialog-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    .dialog-body {
      z-index: 1001;
    }
  }
</style>
