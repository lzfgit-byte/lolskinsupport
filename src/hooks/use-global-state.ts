import {ref, watch} from 'vue-demi';

const drawerOpen = ref(false);
const loading = ref(false);
const logs = ref([]);


export default () => ({
  loading,
  drawerOpen,
  logs,
});
