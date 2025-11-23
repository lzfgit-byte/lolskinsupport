<template>
  <teleport to="#app">
    <div
      v-if="visible"
      ref="maskRef"
      class="dx-dialog"
      pos="absolute top-0 left-0"
      box-border
      h-full
      w-full
      z-1005
      :class="{ dxShowMask: visible }"
      @click="handleMaskClick(false, $event)"
    >
      <div
        ref="contentRef"
        class="dx-content"
        flex
        flex-col
        justify-center
        items-center
        absolute
        :class="{ dxShowDialog: visible, hideBoxShow: !showBoxShadow }"
        :style="{ width: width || '80%', height: height || 'auto' }"
      >
        <div class="dx-header" w-full flex justify-around items-center>
          <div class="dx-header-title" flex justify-start items-center color-white>
            <slot name="title">{{ title }}</slot>
          </div>
          <div class="dx-header-right" h-full flex items-center absolute right-15>
            <slot name="headerRightTag"></slot>
          </div>
          <div class="dx-header-icon" flex justify-end items-center>
            <slot name="headerRight">
              <div
                class="i-material-symbols-light-cancel-outline"
                @click="handleMaskClick(true)"
              ></div>
            </slot>
          </div>
        </div>
        <div class="dx-body" w-full>
          <template v-if="!destroyOnClose || visible">
            <slot></slot>
          </template>
        </div>
        <div v-if="$slots.footer" class="dx-footer" w-full flex justify-end items-center>
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </teleport>
</template>
<script setup lang="ts">
  import { useVModel } from '@vueuse/core';
  import { computed, ref } from 'vue';
  import useDXZIndex from './hooks/useDialogZIndex';

  const props = defineProps({
    width: String,
    height: String,
    title: String,
    visible: Boolean,
    maskClosed: Boolean,
    showBoxShadow: Boolean,
    destroyOnClose: Boolean,
    top: String,
  });
  // 销毁并未销毁render方法，只是销毁的页面元素
  const emits = defineEmits(['update:visible', 'close']);
  const visible_ = useVModel(props, 'visible');
  const hideVis = ref(false);
  const maskRef = ref<HTMLDivElement>();
  const contentRef = ref<HTMLDivElement>();
  const closeDialog = () => {
    emits('close');
    maskRef.value.classList.add('dxHideMask');
    contentRef.value.classList.add('dxHideDialog');
    setTimeout(() => {
      visible_.value = false;
      hideVis.value = false;
      maskRef.value.classList.remove('dxHideMask');
      contentRef.value.classList.remove('dxHideDialog');
    }, 400);
  };
  const handleMaskClick = (closed = false, event = null) => {
    if (closed) {
      closeDialog();
    }
    // 启用点击遮罩层关闭
    if (
      props.maskClosed &&
      event?.target?.className?.indexOf &&
      event?.target?.className?.indexOf('dx-dialog') > -1
    ) {
      closeDialog();
    }
  };
  const topComputed = computed(() => props.top || '20%');
</script>

<style scoped lang="less">
  @import './styles/styles';
  @keyframes showDialog {
    0% {
      top: 0%;
    }
    100% {
      top: v-bind(topComputed);
    }
  }
  @keyframes hideDialog {
    0% {
      top: v-bind(topComputed);
    }
    100% {
      top: 0%;
    }
  }
</style>
