<template>
  <div flex-inline class="ghs-s-con" items-center relative>
    <van-search
      v-model="value"
      class="ghs-search"
      placeholder="请输入"
      allow-clear
      @keydown.enter="handleSearch(value)"
      @change="handleChange"
      @mouseenter="handleChange"
      @click="handleChange"
      @blur="showHistory = false"
    />
    <transition duration="200">
      <div
        v-if="showHistory"
        class="historySearch"
        w-full
        absolute
        z-2
        @mouseleave="showHistory = false"
      >
        <GhsScroller max-height="30vh">
          <div
            v-for="item in data"
            :key="item"
            p-2
            m-1
            class="search-history"
            relative
            flex
            justify-between
            items-center
            @click.stop="handleSearch(item)"
          >
            <span> {{ item }}</span>
            <div @click.stop="handleDelete(item)">x</div>
          </div>
        </GhsScroller>
      </div>
    </transition>
  </div>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import GhsScroller from '@/components/scroller/ghs-scroller.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import { deleteSearch, searchRecommend } from '@/api';
  const emits = defineEmits(['search']);
  const value = ref('');
  const data = ref<any[]>();
  const showHistory = ref(false);
  const { webConfig } = useGlobalState();
  const handleSearch = async (str: string) => {
    value.value = str;
    emits('search', value.value);
  };
  const handleChange = async () => {
    showHistory.value = true;
    const res = await searchRecommend(value.value);
    data.value = res.filter((item) => item.trim() !== '');
  };
  const handleDelete = async (val: string) => {
    await deleteSearch(val);
    await handleChange();
  };
</script>

<style scoped lang="less">
  @import '@/styles/values';
  .ghs-s-con {
  }
  .ghs-search {
    padding: 0;
    transition: border-color 0.3s;
    outline: none;
    &:focus {
      border-color: #409eff;
    }
  }
  .historySearch {
    box-shadow: rgba(149, 157, 165, 0.2) 0px 8px 24px;
    background-color: white;
    border-radius: @radius;
    bottom: 0;
    transform: translateY(102%);
    transition: transform 0.3s linear, opacity 0.3s linear;
    .search-history {
      cursor: pointer;
      border-radius: @radius;
      &:hover {
        background-color: #e2e3e5;
      }
    }
  }
  .clearIcon {
    position: absolute !important;
    transform: translateX(-50%);
  }

  .v-leave-from,
  .v-enter-to {
    transform: translateY(102%);
    opacity: 1;
  }
  .v-enter-from,
  .v-leave-to {
    transform: translateY(96%);
    opacity: 0;
  }
</style>
