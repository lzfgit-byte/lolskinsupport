import { ref, watch } from 'vue-demi';
import { useTitle } from '@vueuse/core';
import { shallowRef } from 'vue';
import { EditorView } from 'codemirror';
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
const logDrawOpen = ref(false);
const autoRoll = ref(true);
const title = useTitle('ghs');
const chuckValue = ref(200);
const codeMirrorView = shallowRef();
const append = (text: string) => {
  if (!autoRoll.value) {
    return;
  }
  const doc = codeMirrorView.value.state.doc;
  const lines = doc.lines;

  let from = doc.length;
  let insert = (doc.length ? '\n' : '') + text;
  // 超过 100 行，删掉最前面的
  if (lines >= chuckValue.value) {
    const removeTo = doc.line(lines - (chuckValue.value - 1)).from;
    codeMirrorView.value.dispatch({
      changes: [
        { from: 0, to: removeTo },
        { from: doc.length, insert },
      ],
      effects: EditorView.scrollIntoView(doc.length + insert.length - removeTo, { y: 'end' }),
    });

    return;
  }
  codeMirrorView.value.dispatch({
    changes: {
      from,
      insert,
    },
    effects: EditorView.scrollIntoView(doc.length + insert.length, { y: 'end' }),
  });
};
export const LogUtil = {
  log: (msg: string) => {
    if (msg.indexOf('【重要】') > -1) {
      title.value = msg;
    }
    append(msg);
  },
  clear: () => {
    codeMirrorView.value?.dispatch({
      changes: {
        from: 0,
        to: codeMirrorView.value?.state?.doc?.length,
        insert: '',
      },
    });
  },
};
export default () => ({
  loading,
  drawerOpen,
  LogUtil,
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
  logDrawOpen,
  autoRoll,
  chuckValue,
  codeMirrorView,
});
