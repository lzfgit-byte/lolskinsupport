<template>
  <van-button type="default" size="small" @click="showBottom = true">菜单</van-button>
  <van-popup v-model:show="showBottom" position="bottom" :style="{ height: '80%' }">
    <div flex style="flex-direction: column" justify-center items-center class="ghs-menu-container">
      <div
        v-for="(item, index) in culRoutes"
        :key="index"
        class="ghs-menu-item"
        :class="{ 'ghs-menu-chose': webKey === item.key }"
        flex
        justify-center
        items-center
        @click="handleClick(item)"
      >
        <div class="ghs-menu-icon" m-r-1 w-4 h-4>
          <GhsImg :url="item.icon" :force="item.force"></GhsImg>
        </div>
        <div class="ghs-title">{{ item.aliasZH }}</div>
      </div>
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import { useRouter } from 'vue-router';
  import type { Ref } from 'vue';
  import { computed, ref, watch } from 'vue';

  import type { RouterType } from '@/router/router';
  import { routes } from '@/router/router';
  import GhsImg from '@/components/image/ghs-img.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import { clearCurrentUrl, setCurrentKeyExp } from '@/api';
  const showBottom = ref(false);
  let router = useRouter();
  const { webKey, loading, active } = useGlobalState();
  const culRoutes: Ref<RouterType[]> = computed(() => routes.value.filter((i) => i.icon)) as any;
  const handleClick = async (item) => {
    if (webKey.value === item.key) {
      return;
    }
    await clearCurrentUrl();
    webKey.value = item.key;
    await setCurrentKeyExp(webKey.value);
    loading.value = true;
    // await router.push(item.path);
    showBottom.value = false;
    active.value = 'home';
  };
  watch(culRoutes, () => {
    if (culRoutes.value.length > 0) {
      router.push({ path: culRoutes.value[0].path, query: { key: culRoutes.value[0].key } });
    }
  });
</script>

<style scoped lang="less">
  .ghs-menu-item {
    width: 100%;
    padding: 10px;
  }
  .ghs-menu-chose {
    background-color: #ccc;
  }
</style>
