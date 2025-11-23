<template>
  <div @click="showBottom = true">Tag</div>
  <van-popup
    v-model:show="showBottom"
    position="bottom"
    :style="{ height: '80%', overflow: 'hidden' }"
  >
    <div h-full w-full p-10px style="overflow-y: auto; overflow-x: hidden">
      <GhsTag
        v-for="(item, index) in tags"
        :key="index"
        :info="item"
        type="waring"
        :show-gap="true"
        @click="handlerClick"
      ></GhsTag>
      <van-empty v-if="tags.length === 0" />
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import GhsTag from '@/components/tag/ghs-tag.vue';
  import useGlobalState from '@/hook/useGlobalState';
  const props = defineProps({ load: Function });

  const showBottom = ref(true);

  const { tags } = useGlobalState();
  const handlerClick = (item: any) => {
    props?.load(item.url);
    showBottom.value = false;
  };
</script>

<style scoped lang="less"></style>
