<template>
  <div h-full w-full>
    <GhsTag
      v-for="(item, index) in tags"
      :key="index"
      :info="item"
      type="waring"
      :show-gap="true"
      @click="load(item.url)"
    ></GhsTag>
    <a-empty v-if="tags.length === 0" />
  </div>
</template>
<script setup lang="ts">
  import GhsTag from '@/components/tag/ghs-tag.vue';
  import useGlobalState from '@/hooks/use-global-state';

  defineProps({ load: Function });
  const { tags } = useGlobalState();
</script>

<style scoped lang="less"></style>
