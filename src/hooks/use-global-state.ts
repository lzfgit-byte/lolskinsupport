import { ref, watch } from 'vue-demi';
import type { mainHeroInfo } from '@/type/type';

const drawerOpen = ref(false);
const loading = ref(false);
const logs = ref([]);
const skinId = ref('');
const heroId = ref('');
const heroAlias = ref('');
const skinPath = ref('');
const gamePath = ref('');
const toolsPath = ref('');
const overlayPath = ref('');
const overlayConfigPath = ref('');
const installedPath = ref('');
const autoChose = ref(true);
const lcuState = ref(false);
const heros = ref<mainHeroInfo[]>();
const loadSkinIds = ref([]);

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
  autoChose,
  lcuState,
  heroAlias,
  heros,
  loadSkinIds,
});
