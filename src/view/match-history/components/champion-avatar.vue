<template>
  <img
    class="champion-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :src="src"
    :alt="alt"
    loading="lazy"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getChampionIconSrc, getChampionSquareIcon } from '@/utils/match-history/images';

const props = withDefaults(
  defineProps<{
    championId: number;
    /** 英雄英文名，用于 CDN 兜底 */
    alias?: string;
    size?: number;
  }>(),
  { size: 32 }
);

const src = ref(props.alias ? getChampionSquareIcon(props.alias) : '');
const alt = props.alias ? `${props.alias} 头像` : `英雄 ${props.championId}`;

onMounted(async () => {
  const icon = await getChampionIconSrc(props.championId, props.alias);
  if (icon) {
    src.value = icon;
  }
});
</script>

<style scoped lang="less">
  .champion-avatar {
    background: #10131c;
    border-radius: 5px;
    object-fit: cover;
    display: block;
    flex-shrink: 0;
  }
</style>
