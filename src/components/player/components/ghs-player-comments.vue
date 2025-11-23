<template>
  <a-float-button
    v-if="commentsRef?.length > 0"
    tooltip="查看评论"
    type="default"
    :style="{
      right: '15px',
      top: '250px',
      width: '30px',
      height: '30px',
      opacity: 0.2,
    }"
    @click="drawerOpenModel = true"
  >
    <template #icon>
      <CommentOutlined :style="{ fontSize: '14px', color: '#323' }" />
    </template>
  </a-float-button>
  <a-drawer
    v-model:open="drawerOpenModel"
    title=""
    placement="right"
    :closable="false"
    :mask-closable="true"
    :z-index="20000"
    root-class-name="ghs-video-drawer-container"
    :content-wrapper-style="{ zIndex: 20000 }"
    :body-style="{ zIndex: 20000, padding: '10px' }"
    width="55%"
    :get-container="getDrawerContainer"
    :style="{ position: 'absolute' }"
  >
    <div h-full w-full overflow-auto>
      <GhsComment
        v-for="item in commentsRef"
        :key="item.comment"
        :datetime="item.datetime"
        :comment="item.comment"
        :image="item.image"
      >
      </GhsComment>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { CommentOutlined } from '@ant-design/icons-vue';
  import type { PropType } from 'vue-demi';
  import type { Comment } from '@ghs/types';
  import { useVModel } from '@vueuse/core';
  import { ref } from 'vue';
  import GhsComment from '@/components/comment/ghs-comment.vue';

  const props = defineProps({ comments: Array as PropType<Comment[]> });
  const emits = defineEmits(['update:comments']);
  const drawerOpenModel = ref(false);
  const commentsRef = useVModel(props, 'comments', emits);

  const getDrawerContainer = () => document.getElementById('body');
</script>

<style scoped lang="less"></style>
