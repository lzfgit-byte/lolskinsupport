<template>
  <div ref="tagCRef" flex-inline mt-5px w-100 overflow-x-auto class="tag-container">
    <slot></slot>
  </div>
</template>
<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue';
  import { ref } from 'vue-demi';
  const tagCRef = ref<HTMLDivElement>();
  const handleWheel = (event) => {
    // 阻止默认的纵向滚动行为
    event.preventDefault();
    if (tagCRef.value) {
      tagCRef.value.scrollLeft += event.deltaY;
    }
  };
  onMounted(() => {
    tagCRef?.value?.addEventListener('wheel', handleWheel);
  });
  onUnmounted(() => {
    tagCRef.value?.removeEventListener('wheel', handleWheel);
  });
</script>

<style scoped lang="less">
  .tag-container::-webkit-scrollbar {
    display: none;
  }
</style>
