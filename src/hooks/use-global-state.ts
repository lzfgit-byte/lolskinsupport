import { ref, watch } from 'vue-demi';

const drawerOpen = ref(false);
const loading = ref(false);
const logs = ref([]);
const skinId = ref('');
const heroId = ref('');
const skinPath = ref('');

export default () => ({
  loading,
  drawerOpen,
  logs,
  skinId,
  heroId,
  skinPath,
});
