import { ref, watch } from 'vue-demi';

const drawerOpen = ref(false);
const loading = ref(false);
const logs = ref([]);
const skinId = ref('');
const heroId = ref('');
const skinPath = ref('');
const gamePath = ref('');
const toolsPath = ref('');
const overlayPath = ref('');
const overlayConfigPath = ref('');
const installedPath = ref('');
const autoChose = ref(false);

export default () => ({
  loading,
  drawerOpen,
  logs,
  skinId,
  heroId,
  skinPath,
  gamePath,
  toolsPath,
  overlayPath,
  overlayConfigPath,
  installedPath,
});
