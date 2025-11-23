<template>
  <div class="loader JS_on">
    <span class="binary"></span>
    <span class="binary"></span>
    <span class="getting-there">LOADING STUFF...</span>
  </div>
  <a-float-button
    v-if="showCloseIcon"
    type="default"
    :style="{ right: '30px', bottom: '30px' }"
    @click="loading = false"
  >
    <template #icon>
      <CloseOutlined />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import { CloseOutlined } from '@ant-design/icons-vue';
  import useGlobalState from '@/hooks/use-global-state';
  const { showCloseIcon, loading } = useGlobalState();
</script>

<style scoped lang="less">
  html,
  body {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2d4654;
  }

  .loader {
    width: 130px;
    height: 170px;
    position: relative;
    // background: rgba(black, 0.2); // testing

    &::before,
    &::after {
      content: '';
      width: 0;
      height: 0;
      position: absolute;
      bottom: 30px;
      left: 15px;
      z-index: 1;
      border-left: 50px solid transparent;
      border-right: 50px solid transparent;
      border-bottom: 20px solid darken(#2d4654, 10%);
      transform: scale(0);
      transition: all 0.2s ease;
    }
    &::after {
      border-right: 15px solid transparent;
      border-bottom: 20px solid darken(#2d4654, 13%);
    }

    .getting-there {
      width: 120%;
      text-align: center;
      position: absolute;
      bottom: 0;
      left: -7%;
      font-family: 'Lato';
      font-size: 12px;
      letter-spacing: 2px;
      color: white;
    }

    .binary {
      width: 100%;
      height: 140px;
      display: block;
      color: white;
      position: absolute;
      top: 0;
      left: 15px;
      z-index: 2;
      overflow: hidden;

      &::before,
      &::after {
        font-family: 'Lato';
        font-size: 24px;
        position: absolute;
        top: 0;
        left: 0;
        opacity: 0;
      }

      &:nth-child(1) {
        &::before {
          content: '0';
          animation: a 1.1s linear infinite;
        }
        &::after {
          content: '0';
          animation: b 1.3s linear infinite;
        }
      }
      &:nth-child(2) {
        &::before {
          content: '1';
          animation: c 0.9s linear infinite;
        }
        &::after {
          content: '1';
          animation: d 0.7s linear infinite;
        }
      }
    }

    // ACTIVATE
    &.JS_on {
      &::before,
      &::after {
        transform: scale(1);
      }
    }
  }

  @keyframes a {
    0% {
      transform: translate(30px, 0) rotate(30deg);
      opacity: 0;
    }
    100% {
      transform: translate(30px, 150px) rotate(-50deg);
      opacity: 1;
    }
  }
  @keyframes b {
    0% {
      transform: translate(50px, 0) rotate(-40deg);
      opacity: 0;
    }
    100% {
      transform: translate(40px, 150px) rotate(80deg);
      opacity: 1;
    }
  }
  @keyframes c {
    0% {
      transform: translate(70px, 0) rotate(10deg);
      opacity: 0;
    }
    100% {
      transform: translate(60px, 150px) rotate(70deg);
      opacity: 1;
    }
  }
  @keyframes d {
    0% {
      transform: translate(30px, 0) rotate(-50deg);
      opacity: 0;
    }
    100% {
      transform: translate(45px, 150px) rotate(30deg);
      opacity: 1;
    }
  }
</style>
