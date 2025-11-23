<template>
  <div ref="containerRef" h-full w-full overflow-auto>
    <ComicImage
      v-for="item in comicImages"
      :key="item.url"
      :url="item.url"
      :extra="item.extra"
    ></ComicImage>
    <a-drawer v-model:open="drawValue" title="目录" width="40vw">
      <div
        v-for="(item, index) in contents"
        :key="item.url"
        flex
        justify-start
        items-center
        m-b-2
        :class="{ currentContentInDraw: currentContent?.contentUrl === item.url }"
      >
        <span v-if="currentContent?.contentUrl === item.url">
          {{ `${index + 1}/${contents.length}` }}
        </span>
        <a-button
          :type="currentContent?.contentUrl === item.url ? 'link' : 'text'"
          size="small"
          w-full
          text-start
          @click="getImages(item.url)"
        >
          <GhsText :value="item.title"></GhsText>
        </a-button>
      </div>
    </a-drawer>
  </div>
  <a-float-button :style="{ right: '15px', bottom: '140px' }">
    <template #icon>
      {{ (percent * 100).toFixed(0) }}
    </template>
  </a-float-button>
  <a-float-button :style="{ right: '15px', bottom: '90px' }" @click="drawValue = true">
    <template #icon>
      <ProfileOutlined />
    </template>
  </a-float-button>
  <a-float-button :style="{ right: '15px', bottom: '40px' }" @click="router.back()">
    <template #icon>
      <RollbackOutlined />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import { useRoute, useRouter } from 'vue-router';
  import { ProfileOutlined, RollbackOutlined } from '@ant-design/icons-vue';
  import useComicState from '@/components/comic/hooks/useComicState';
  import ComicImage from '@/components/comic/comic-image.vue';
  import GhsText from '@/components/text/ghs-text.vue';

  const route = useRoute();
  const router = useRouter();
  const { containerRef, contents, getImages, comicImages, drawValue, currentContent, percent } =
    useComicState(route?.query?.url as string);
</script>

<style scoped lang="less"></style>
