<template>
  <div class="ghs-item-container" relative inline-flex flex-col justify-start items-center>
    <div
      v-if="loading"
      class="loading-container"
      h-full
      w-full
      absolute
      z-2
      flex
      justify-center
      items-center
    >
      <van-loading type="spinner" />
    </div>
    <div
      v-if="$props?.onCloseClick"
      absolute
      class="ghs-delete-icon"
      cursor-pointer
      color-black
      @click="handleCloseClick"
    >
      <van-icon name="close" />
    </div>
    <div class="ghs-item-coverImg" w-full relative>
      <GhsImg
        cursor-pointer
        :max-height="maxHeight"
        :max-width="maxWidth"
        :url="item.coverImg"
        @click="handleImgClick"
      />
      <div v-if="!hideTag" absolute top-2 right-1 flex justify-end items-center gap-1>
        <GhsTag v-for="(item_, index) in item.tags" :key="index" :info="item_"></GhsTag>
      </div>
    </div>
    <div v-if="item.title" class="ghs-item-title" w-full flex justify-start items-center>
      <GhsText :value="item.title" />
      <van-icon
        v-if="!isCollect && !$props?.onCloseClick"
        color-black
        name="star-o"
        @click="toggleCollect"
      />
      <van-icon
        v-if="isCollect && !$props?.onCloseClick"
        color-black
        name="star"
        @click="toggleCollect"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { PropType } from 'vue';
  import { computed, onMounted, ref, watch } from 'vue';
  import type { Item } from '@ghs/types';
  import GhsImg from '@/components/image/ghs-img.vue';
  import GhsText from '@/components/text/ghs-text.vue';
  import GhsTag from '@/components/tag/ghs-tag.vue';
  import { cancelCollect, isCollect as f_isCollect, saveCollect } from '@/api';

  const props = defineProps({
    width: String,
    height: String,
    onCloseClick: Function,
    hideTag: Boolean,
    maxHeight: String,
    maxWidth: String,
    item: Object as PropType<Item>,
    collectSequence: Number,
    loading: Boolean,
  });
  const emits = defineEmits(['imgClick', 'closeClick', 'upCollect', 'upCollectClose']);
  const c_width = computed(() => props.width || '250px');
  const imgHeight = computed(() => props.height || '200px');
  const isCollect = ref(false);
  const handleImgClick = async () => {
    emits('imgClick');
    if (isCollect.value) {
      await saveCollect(props.item);
      emits('upCollect');
    }
  };
  const juCollect = async () => {
    isCollect.value = await f_isCollect(props.item);
  };
  const toggleCollect = async () => {
    debugger;
    if (isCollect.value) {
      await cancelCollect(props.item);
    } else {
      await saveCollect(props.item);
    }
    await juCollect();
    emits('upCollect');
  };
  const handleCloseClick = async () => {
    await cancelCollect(props.item);
    emits('upCollectClose');
  };
  onMounted(async () => {
    await juCollect();
  });
  watch(
    () => props?.collectSequence,
    async () => {
      await juCollect();
    }
  );
</script>

<style scoped lang="less">
  @import '@/styles/values';
  @infoPadding: 5px 0 0 0px;
  .ghs-item-container {
    padding: 0 5px 1px 5px;
    margin: 0 5px 5px 5px;
    border-radius: @radius;
    width: v-bind(c_width);
    box-shadow: rgba(67, 71, 85, 0.27) 0 0 0.25em, rgba(90, 125, 188, 0.05) 0 0.25em 1em;
    .ghs-item-coverImg {
      height: v-bind(imgHeight);
    }
    .ghs-item-title {
      padding: @infoPadding;
    }
    .ghs-item-author {
      padding: @infoPadding;
    }
    .ghs-item-tags {
      padding: @infoPadding;
    }
  }
  .ghs-delete-icon {
    width: 15px;
    height: 15px;
    right: -2%;
    top: -4%;
    z-index: 3;
  }
  .loading-container {
    background-color: rgba(51, 51, 51, 0.44);
  }
</style>
