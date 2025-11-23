<template>
  <van-button
    v-if="comments?.length > 0"
    type="default"
    size="small"
    @click="drawerOpenModel = true"
    >查看评论</van-button
  >
  <van-popup v-model:show="drawerOpenModel" position="bottom" :style="{ height: '80%' }">
    <div h-full w-full overflow-auto>
      <GhsComment
        v-for="item in comments"
        :key="item.comment"
        :datetime="item.datetime"
        :comment="item.comment"
      >
      </GhsComment>
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import type { PropType } from 'vue';
  import { ref } from 'vue';
  import GhsComment from '@/components/comment/ghs-comment.vue';

  const props = defineProps({ comments: Array as PropType<any[]> });
  const drawerOpenModel = ref(false);
</script>

<style scoped lang="less"></style>
