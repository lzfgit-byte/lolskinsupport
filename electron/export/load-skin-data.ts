import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Path from 'node:path';
import AdmZip from 'adm-zip';
import { IS_USE_COMMAND, modToolsWrapper } from '../const';
import { LogMsgUtil, MessageUtil, NotifyMsgUtil } from '../utils/message';
import { wadPathHash } from '../utils/wad-hash';
import { extractWadByHash, extractWadFiles, extractWadSkinBins } from './extract-wad-chunks';
import { readAudioBlocks, type AudioBlocks } from './skin-audio';
import {
  binsToPyCall,
  convertBinsToPy,
  pyToBinsCall,
  ritobinHashTablesDir,
  ritobinToolPath,
} from './ritobin';
import { resolveSkinBinIndexPath } from '../utils/tools-path';
import { discoverWadSkinBins } from './wad-index';
import {
  collectBankPaths,
  collectVoiceBankPaths,
  createSidecarRegistry,
  flushSidecars,
  planBankAliases,
} from './skin-banks';
import {
  applyGearVfxMap,
  findCaseInsensitive,
  readGearShowList,
  readGearVfxMap,
  readSkinMeshFields,
  readSkinMeshRefs,
  readSkinClassification,
  rebaseSkinPy,
  unhideSubmeshes,
} from './skin-rebase';
import {
  animationGraphBinRef,
  animationGraphTargetPath,
  readAnimationGraphLink,
  rebaseAnimationGraphPy,
  rebaseSkinAnimationLink,
} from './skin-animation';
import { checkSkinNames, describeSkinCheck, SKIN_ARCHIVE_BUILDER, writeSkinCheck } from './skin-check';
import {
  composeEmitters,
  copyResolvedEntries,
  dropChampionSkinId,
  dropIdleEffectsWithoutJoints,
  dropSkinKeywordGates,
  ensureSkinParent,
  findUnresolvedResourceRefs,
  mergeLinkedBins,
  readChampionSkinName,
  readEntryKeyOfClass,
  readLinkedBins,
  stripInlineEntries,
} from './skin-base-slot';
import { applySkinPatch } from './skin-patch';
import { findSkinPatch } from './skin-patches';
import { readSkeletonJointNames } from './skin-mesh';

// 模拟 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSkinSuffix = 'leagueSkins';
// --- 配置区 ---
let WAD_SOURCE_DIR = 'E:\\game\\Riot Games\\League of Legends\\Game\\DATA\\FINAL\\Champions';
let EXTRACT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skins';
let OUTPUT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skin_out';
let OUTPUT_WAD_BASE_DIR = `C:\\Users\\18074\\Downloads\\${defaultSkinSuffix}`;
let MOD_TOOLS_PATH = 'E:\\lolsupport\\cslol-manager\\cslol-tools';

export const setConfigData = (
  gamePath,
  outBasePath,
  modToolsPath,
  skinSuffix = defaultSkinSuffix
) => {
  WAD_SOURCE_DIR = Path.normalize(`${gamePath}\\DATA\\FINAL\\Champions`);
  EXTRACT_BASE_DIR = Path.normalize(`${outBasePath}\\skins`);
  OUTPUT_BASE_DIR = Path.normalize(`${outBasePath}\\skin_out`);
  OUTPUT_WAD_BASE_DIR = Path.normalize(`${outBasePath}\\${skinSuffix}`);
  MOD_TOOLS_PATH = Path.join(modToolsPath, '..');
};

/**
 * 自动构建时的日志改道：默认发到页面日志抽屉，设置 sink 后只发给构建窗口。
 * 这样「没皮肤就自动构建」不会把页面日志刷满。
 */
let buildLogSink: ((message: string) => void) | null = null;

export const setBuildLogSink = (sink: ((message: string) => void) | null) => {
  buildLogSink = sink;
};

const logData = (msg: string, ...data: any[]) => {
  console.log(msg, ...data);
  if (buildLogSink) {
    const extra = data
      .filter((item) => item !== undefined && item !== null && `${item}`.length > 0)
      .map((item) => `${item}`)
      .join(' ');
    buildLogSink(extra ? `${msg} ${extra}` : msg);
    return;
  }
  LogMsgUtil.sendLogMsg(msg + data?.toString());
};
const deleteFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logData(` 删除文件失败: ${filePath}`);
  }
};
const deleteDir = (path) => {
  try {
    fs.rmdirSync(path);
    console.log('文件夹已异步删除');
  } catch (err) {
    console.error('删除出错:', err);
  }
};
/**
 * 执行系统命令
 */
const runCommand = async (command: string, sendPregress = true, ...args: any[]) => {
  await modToolsWrapper.execToolWithTimeout(command, args, 50000, sendPregress).catch((msg) => {
    MessageUtil.error(msg);
  });
};
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    fs.rmSync(full, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

const patchPyFile = (heroName: string, pyPath: string, skinId: any) => {
  if (!fs.existsSync(pyPath)) {
    return;
  }
  let replaceData = `"Characters/${heroName}/Skins/Skin0"`;
  let resource = `"Characters/${heroName}/Skins/Skin0/Resources"`;
  try {
    let content = fs.readFileSync(pyPath, 'utf-8');
    const lines = content.split('\n');
    const processedLines = lines.map((line) => {
      // 1. 匹配 SkinCharacterDataProperties
      // 逻辑：替换 = 号前面的内容，保留缩进
      if (line.includes('SkinCharacterDataProperties') && line.includes('=')) {
        // 正则匹配：(缩进)(任意内容)=(剩余部分)
        const res = line.replace(line.split('=')[0].trim(), replaceData);
        logData(`SkinCharacterDataProperties 替换 |${line}| -> |${res}|`);
        return res;
      }

      // 2. 匹配 mResourceResolver
      // 逻辑：替换 = 号后面的内容
      if (line.includes('mResourceResolver') && line.includes('=')) {
        const res = line.replace(line.split('=')[1].trim(), resource);
        logData(`mResourceResolver 替换 |${line}| -> |${res}|`);
        return res;
      }

      // 3. 匹配 包含 ResourceResolver 但不是 mResourceResolver 的行（或根据你要求的通用匹配）
      // 逻辑：替换 = 号前面的内容
      if (
        line.includes('ResourceResolver') &&
        !line.includes('mResourceResolver') &&
        !line.includes('pointer') &&
        line.includes('=')
      ) {
        const res = line.replace(line.split('=')[0].trim(), resource);
        logData(`ResourceResolver 替换 |${line}| -> |${res}|`);
        return res;
      }
      return line;
    });

    fs.writeFileSync(pyPath, processedLines.join('\n'), 'utf-8');
    logData(`${heroName}_${skinId}_${pyPath} --> 修改结束`);
  } catch (err) {
    logData(` [修改失败] 处理 ${pyPath} 时出错:`, err.message);
  }
};

/** 该角色 base 皮肤的身份（championSkinName + 音频段），每个角色只读一次游戏 skin0.bin */
const baseSkinCache = new Map<
  string,
  {
    name: string;
    audio: AudioBlocks | null;
    mesh: { skeleton?: string; simpleSkin?: string };
    classification: number | null;
    /** base 皮肤的 `linked` 清单：本皮肤 bin 没列的，要并进 base-slot 的清单里 */
    linked: string[];
  }
>();

/**
 * 从游戏 WAD 解出来的 skin0.bin 里读 base 皮肤的 championSkinName（如 VayneBase）
 * 和音频身份的两段（tagEventList / bankUnits）。
 *
 * 不能靠拼字符串猜：不同英雄叫法不一样（VayneBase / Jade_VayneBase / AnnieBase…），
 * Rose 的 baseskin 也是从游戏数据里取的。
 *
 * `prefetchedPy` 是批量解包时已经转好的 py（省掉一次 3 秒的 ritobin 启动）。
 */
const readBaseSkinData = async (
  baseBinPath: string,
  character: string,
  prefetchedPy?: string
): Promise<{
  name: string;
  audio: AudioBlocks | null;
  /** base 皮肤 bin 里的骨架/网格引用（大小写照抄，用来写回皮肤 bin） */
  mesh: { skeleton?: string; simpleSkin?: string };
  /** base 皮肤的 `skinClassification`（独立皮肤是 1），炫彩要照它写 */
  classification: number | null;
  /** base 皮肤的 `linked` 清单（base-slot 包要和本皮肤的并集） */
  linked: string[];
}> => {
  const cached = baseSkinCache.get(character);
  if (cached !== undefined) {
    return cached;
  }
  let basePy: string | null = null;
  try {
    if (prefetchedPy && fs.existsSync(prefetchedPy)) {
      basePy = prefetchedPy;
    } else if (fs.existsSync(baseBinPath)) {
      const call = binsToPyCall(baseBinPath);
      await runCommand(call.command, false, ...call.args);
      basePy = baseBinPath.replace(/\.bin$/, '.py');
    }
    if (!basePy || !fs.existsSync(basePy)) {
      const empty = { name: '', audio: null, mesh: {}, classification: null, linked: [] };
      baseSkinCache.set(character, empty);
      return empty;
    }
    const text = fs.readFileSync(basePy, 'utf-8');
    const matched = /championSkinName:\s*string\s*=\s*"([^"]*)"/.exec(text);
    const name = matched ? matched[1] : '';
    const audio = readAudioBlocks(text);
    const mesh = readSkinMeshFields(text);
    const classification = readSkinClassification(text);
    const linked = readLinkedBins(text);
    if (!prefetchedPy) {
      fs.rmSync(basePy, { force: true });
    }
    logData(
      ` [base-skin] ${character} 的 base 皮肤: ${name || '(没找到)'}` +
        `，音频段 ${audio ? '已读到' : '没读到'}` +
        `，骨架 ${mesh.skeleton ?? '(没读到)'}` +
        `，linked ${linked.length} 条`
    );
    const result = { name, audio, mesh, classification, linked };
    baseSkinCache.set(character, result);
    return result;
  } catch (error) {
    logData(` [base-skin] 读取 ${character} base 皮肤数据失败:`, error?.message ?? error);
    const result = { name: '', audio: null, mesh: {}, classification: null, linked: [] };
    baseSkinCache.set(character, result);
    return result;
  }
};

/**
 * 从游戏 WAD 里按路径取出若干文件（网格、骨架、声音 bank）。
 *
 * 生成流程解包用的是 extractWadSkinBins，只拿 `data/characters/<champ>/skins/skin*.bin`，
 * 里面没有 `assets/` 下的文件 —— 所以这里按路径哈希直接从原 WAD 取；如果解包目录里
 * 已经有（`IS_USE_COMMAND` 走 wad-extract.exe 时会有），直接读磁盘。
 */
const extractWadAssets = async (
  wadPath: string,
  refs: string[],
  extractRoot?: string,
  label = '资源',
  quiet = false
): Promise<Map<string, Buffer>> => {
  const assets = new Map<string, Buffer>();
  const wanted: string[] = [];
  for (const ref of refs) {
    if (assets.has(ref.toLowerCase())) {
      continue;
    }
    const local = extractRoot ? findCaseInsensitive(extractRoot, ref) : null;
    if (local) {
      assets.set(ref.replace(/\\/g, '/').toLowerCase(), fs.readFileSync(local));
      continue;
    }
    wanted.push(ref);
  }
  if (wanted.length === 0) {
    return assets;
  }
  const outputDir = path.join(
    os.tmpdir(),
    `lol-skin-assets-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  try {
    const result = await extractWadByHash({
      wadPath,
      files: wanted.map((filePath) => ({ hash: wadPathHash(filePath), filePath })),
      outputDir,
    });
    for (const item of result.files as Array<{
      filePath?: string;
      outputPath?: string;
      error?: string;
    }>) {
      if (item.error || !item.filePath || !item.outputPath || !fs.existsSync(item.outputPath)) {
        if (!quiet) {
          logData(` [base-skin] 取${label}失败 ${item.filePath ?? ''}: ${item.error ?? '没有输出'}`);
        }
        continue;
      }
      assets.set(item.filePath.replace(/\\/g, '/').toLowerCase(), fs.readFileSync(item.outputPath));
    }
  } catch (error) {
    if (!quiet) {
      logData(` [base-skin] 从游戏 WAD 取${label}出错:`, error?.message ?? error);
    }
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  return assets;
};

/**
 * 从英雄 WAD 旁边的语言 WAD（`<英雄>.zh_CN.wad.client` 之类）里取文件。
 *
 * 语音 bank 只在语言 WAD 里；各个语言的事件/Action 是一样的，所以找到一份就够。
 */
const extractWadAssetsFromLocales = async (
  wadPath: string,
  refs: string[],
  label = '语音 bank'
): Promise<Map<string, Buffer>> => {
  const assets = new Map<string, Buffer>();
  if (refs.length === 0) {
    return assets;
  }
  const directory = path.dirname(wadPath);
  const stem = path.basename(wadPath).replace(/\.wad\.client$/i, '');
  let candidates: string[] = [];
  try {
    candidates = fs
      .readdirSync(directory)
      .filter((name) =>
        new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[A-Za-z]{2}_[A-Za-z]{2}\\.wad\\.client$`, 'i').test(
          name
        )
      )
      .sort((left, right) => {
        // 中文客户端优先：文件一定在，读起来最省事
        const leftZh = /zh_CN/i.test(left) ? 0 : 1;
        const rightZh = /zh_CN/i.test(right) ? 0 : 1;
        return leftZh - rightZh || left.localeCompare(right);
      })
      .map((name) => path.join(directory, name));
  } catch {
    candidates = [];
  }
  let pending = refs.slice();
  for (const candidate of candidates) {
    if (pending.length === 0) {
      break;
    }
    const found = await extractWadAssets(candidate, pending, undefined, label, true);
    for (const [key, value] of found) {
      assets.set(key, value);
    }
    pending = pending.filter((ref) => !assets.has(ref.replace(/\\/g, '/').toLowerCase()));
  }
  if (pending.length > 0) {
    logData(` [base-skin] 语言 WAD 里还差 ${pending.length} 个${label}：${pending.join(', ')}`);
  }
  return assets;
};

/**
 * 把皮肤自己的动画图（`animations/skin<N>.bin`）改名成 Skin0 放进包里，
 * 并把皮肤 bin 里的链接（`animationGraphData` + `linked` 清单）指过去。
 *
 * 不做的话：改成 base 皮肤后游戏用的是 base 那份动画图，传说/终极皮肤自己的
 * 动作（走路 `run.anm` 等）不在里面 —— 模型会滑步、不播走路动画。
 * 依据见 `skin-animation.ts` 顶部说明，以及 Rose 的 21069 皮肤包
 * （`LeagueSkins/skins/21/21069/21069.fantome`，里面就多这一份
 * `data/characters/missfortune/animations/skin0.bin`）。
 *
 * 失败一律保持原来的引用（和以前的行为一样），不影响出包。
 */
const rebaseSkinAnimationGraph = async (options: {
  /** 皮肤 bin 的 py（会被改写链接） */
  pyPath: string;
  /** 角色目录名（小写，`missfortune`） */
  character: string;
  /** 打包目录（wad-make 的输入） */
  packDir: string;
  /** 原 WAD 路径（按路径哈希取动画图） */
  fullWadPath: string;
  /** 解包目录（有就直接读磁盘） */
  extractRoot?: string;
}): Promise<void> => {
  const { pyPath, character, packDir } = options;
  if (!fs.existsSync(pyPath)) {
    return;
  }
  const text = fs.readFileSync(pyPath, 'utf-8');
  const link = readAnimationGraphLink(text);
  // 没有这个字段（很老的皮肤）或者本来就指向 base 的动画图：不用动
  if (!link || link.skin === 0) {
    return;
  }
  // 链接到别的角色目录的动画图（很少见）：换成 Skin0 会指到我们没放进包的那份，保持原样
  if (link.hero.toLowerCase() !== character.toLowerCase()) {
    logData(
      ` [动画图] ${character}: 皮肤链接到别的角色目录 ${link.hero}，动画图保持原来的引用`
    );
    return;
  }
  const ref = animationGraphBinRef(link);
  const assets = await extractWadAssets(
    options.fullWadPath,
    [ref],
    options.extractRoot,
    '动画图',
    true
  );
  const source = assets.get(ref.toLowerCase());
  if (!source) {
    logData(` [动画图] ${character}: 游戏 WAD 里没有 ${ref}，动画图保持原来的引用`);
    return;
  }
  const work = path.join(OUTPUT_BASE_DIR, character, '_anim', `skin${link.skin}`);
  try {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const binPath = path.join(work, `skin${link.skin}.bin`);
    fs.writeFileSync(binPath, source);
    const toPy = binsToPyCall(binPath);
    await runCommand(toPy.command, false, ...toPy.args);
    const graphPy = binPath.replace(/\.bin$/, '.py');
    if (!fs.existsSync(graphPy)) {
      logData(` [动画图] ${character}: ritobin 没转出 ${ref} 的 py，保持原来的引用`);
      return;
    }
    const graphText = fs.readFileSync(graphPy, 'utf-8');
    const rebased = rebaseAnimationGraphPy(graphText, link);
    fs.writeFileSync(graphPy, rebased.text, 'utf-8');
    const toBin = pyToBinsCall(graphPy);
    await runCommand(toBin.command, false, ...toBin.args);
    if (!fs.existsSync(binPath)) {
      logData(` [动画图] ${character}: ${ref} 转回 bin 失败，保持原来的引用`);
      return;
    }
    const target = path.join(packDir, animationGraphTargetPath(character));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(binPath, target);
    // 链接最后改：上面任何一步失败都还留着原来的 Skin<N>，行为和以前一样
    const relinked = rebaseSkinAnimationLink(text, link);
    fs.writeFileSync(pyPath, relinked.text, 'utf-8');
    logData(
      ` [动画图] ${character}: ${ref} -> ${animationGraphTargetPath(character)}` +
        `（${link.link} -> ${link.link.replace(/Skin\d+$/i, 'Skin0')}` +
        `，改写 ${relinked.replaced.join(' + ') || '无'}）`
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
};

/**
 * gear 系统被去掉之后的补偿（两件事，都从 gear 对象里读）：
 *
 * 1. `initialSubmeshToHide` 把 A/B/C 三套枪的 submesh 全藏起来、靠 gear 按档位显示；
 *    去掉 gear 后没人显示它们，模型上少两把枪 —— 把第一档 gear 的
 *    `mCharacterSubmeshesToShow` 从隐藏列表里删掉（`unhideSubmeshes`）；
 * 2. 皮肤自己的 `Resources` 里 `MissFortune_W_Buf_LWeapon` / `W_Max` / `P_Buff` 这些 key
 *    是 `0x0`（空），靠 gear 的 `mVFXResourceResolver` 补 — 去掉 gear 后 W 的枪口特效就没了；
 *    把 gear 的 `resourceMap` 补进皮肤自己的 `Resources`（`applyGearVfxMap`）。
 *
 * gear 对象不在皮肤包里（在「多皮肤」bin 里），所以按皮肤 bin 的 `linked` 清单去游戏 WAD 里
 * 挨个找。Rose 的 21069 包也是这么补的（它的 `Resources` 里 W/被动那几个 key 都有值）。
 */
const revealGearSubmeshes = async (options: {
  pyPath: string;
  link: string;
  character: string;
  fullWadPath: string;
  extractRoot?: string;
}): Promise<void> => {
  const { pyPath, link, character } = options;
  if (!fs.existsSync(pyPath)) {
    return;
  }
  const text = fs.readFileSync(pyPath, 'utf-8');
  const candidates = [
    ...new Set(
      [...text.matchAll(/"(DATA\/[^"]+\.bin)"/g)].map((matched) => matched[1] as string)
    ),
  ];
  if (candidates.length === 0) {
    return;
  }
  const assets = await extractWadAssets(
    options.fullWadPath,
    candidates,
    options.extractRoot,
    'gear bin',
    true
  );
  const work = path.join(OUTPUT_BASE_DIR, character, '_gear');
  try {
    for (const candidate of candidates) {
      const data = assets.get(candidate.toLowerCase());
      if (!data) {
        continue;
      }
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
      const binPath = path.join(work, 'gear.bin');
      fs.writeFileSync(binPath, data);
      // 用完整名字表转：gear 的 `resourceMap` 值是粒子路径，名字解出来才能按名字对上
      const toPy = binsToPyCall(binPath, false, ritobinHashTablesDir());
      await runCommand(toPy.command, false, ...toPy.args);
      const gearPy = binPath.replace(/\.bin$/, '.py');
      if (!fs.existsSync(gearPy)) {
        continue;
      }
      const gearText = fs.readFileSync(gearPy, 'utf-8');
      const show = readGearShowList(gearText, link);
      const vfx = readGearVfxMap(gearText, link);
      if (!show && !vfx) {
        continue;
      }
      let next = text;
      const unhidden = unhideSubmeshes(next, show ?? []);
      next = unhidden.text;
      const mapped = applyGearVfxMap(next, vfx ?? []);
      next = mapped.text;
      if (next !== text) {
        fs.writeFileSync(pyPath, next, 'utf-8');
      }
      logData(
        ` [base-skin] ${character}: gear 补偿 —— submesh 补显示：` +
          `${unhidden.removed.join(', ') || '无'}；特效映射补 ${mapped.mapped.length} 条`
      );
      return;
    }
    logData(` [base-skin] ${character}: 没找到 gear 对象 ${link}，枪械 submesh/特效不补`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
};

/**
 * builder 7：把 rebase 好的皮肤 bin 改造成「base-slot 外壳」（规则和理由见 `skin-base-slot.ts`
 * 的文件头，对照 Rose 的 `skins/68/68003/68003.fantome`）：
 *
 * 1. 该皮肤自己的 bin **整份随包**（覆盖同路径），只把 `keywordsRequired` 里含原皮肤名的
 *    闸门删掉 —— 粒子按皮肤 tag 过滤，base 身份拿不到原皮肤的 tag，不删的话 E 的火箭、
 *    推进器这些 emitter 全都不渲染；
 * 2. base 那份只留「身份对象 + Resources」，粒子仍由上面那份提供；
 * 3. `linked` 并上 base 皮肤的清单（`Resources` 里指向 `Skins/Skin0/Particles/...` 的 key
 *    定义在 base 清单独有的多皮肤 bin 里，少了它们 R/E 的施法特效会解析不到）；
 * 4. 挂点骨头不存在的 idle 特效应删掉（会塌到脚下）。
 */
const applyBaseSlotShell = async (options: {
  /** base-slot 的 py（会被改写成只剩身份 + Resources） */
  pyPath: string;
  /** 打包目录（wad-make 的输入） */
  packDir: string;
  /** 角色目录名（小写） */
  character: string;
  /** 皮肤序号，>0 时才会随包原皮肤的 bin */
  skinId: number;
  /** 原皮肤 bin 的原始 py（没 patch 过身份的那份） */
  sourcePyPath: string;
  /** base 皮肤的 linked 清单 */
  baseLinks: string[];
  /** 随包的骨架（相对 packDir），读关节名用；没有就跳过 idle 检查 */
  skeletonPath: string | null;
  log: (message: string) => void;
}): Promise<void> => {
  const { pyPath, packDir, character, skinId, log } = options;
  if (!fs.existsSync(pyPath)) {
    return;
  }
  /** 随包的皮肤 bin 文本（已删皮肤名闸门），补丁要按 hash 从里面搬条目 */
  let gatedText = '';

  if (skinId > 0 && fs.existsSync(options.sourcePyPath)) {
    const sourceText = fs.readFileSync(options.sourcePyPath, 'utf-8');
    const sourceSkinName = readChampionSkinName(sourceText);
    const gated = dropSkinKeywordGates(sourceText, sourceSkinName);
    gatedText = gated.text;
    const overridePy = path.join(packDir, `data/characters/${character}/skins/skin${skinId}.py`);
    fs.mkdirSync(path.dirname(overridePy), { recursive: true });
    fs.writeFileSync(overridePy, gated.text, 'utf-8');
    const toBin = pyToBinsCall(overridePy);
    await runCommand(toBin.command, false, ...toBin.args);
    const overrideBin = overridePy.replace(/\.py$/, '.bin');
    if (fs.existsSync(overrideBin)) {
      log(
        ` [base-slot] ${character}: 皮肤自己的 bin 随包 skin${skinId}.bin` +
          `（删掉 ${gated.removed.length} 处皮肤名 VFX 闸门：${gated.removed.slice(0, 3).join('；') || '无'}）`
      );
    } else {
      log(` [base-slot] ${character}: skin${skinId}.py 转回 bin 失败，粒子将没有来源`);
    }
    deleteFile(overridePy);
  }

  let text = fs.readFileSync(pyPath, 'utf-8');
  const propsKey = readEntryKeyOfClass(text, 'SkinCharacterDataProperties');
  const resourceKey = readEntryKeyOfClass(text, 'ResourceResolver');
  if (!propsKey || !resourceKey) {
    log(` [base-slot] ${character}: 找不到身份对象/Resources，保持原来的整份 bin`);
    return;
  }

  const noId = dropChampionSkinId(text);
  text = noId.text;
  const parent = ensureSkinParent(text);
  text = parent.text;

  let idleDropped: string[] = [];
  if (options.skeletonPath) {
    const skeletonFile = path.join(packDir, options.skeletonPath);
    const joints = fs.existsSync(skeletonFile)
      ? readSkeletonJointNames(fs.readFileSync(skeletonFile))
      : [];
    if (joints.length > 0) {
      const idle = dropIdleEffectsWithoutJoints(text, joints);
      text = idle.text;
      idleDropped = idle.removed;
    } else {
      log(` [base-slot] ${character}: 骨架读不出关节名，跳过 idle 特效检查`);
    }
  }

  const stripped = stripInlineEntries(text, [propsKey, resourceKey]);
  text = stripped.text;
  const relinked = mergeLinkedBins(text, [
    ...options.baseLinks,
    `data/characters/${character}/skins/skin${skinId}.bin`,
  ]);
  text = relinked.text;

  // builder 8：英雄专属补丁（`skin-patches/`）。没有登记的英雄就是纯数据流程，这里什么都不做 ——
  // 只有「游戏数据里根本没有这段定义」的皮肤才需要补丁，补丁只插入数据块，不改已有字段。
  const patched = applySkinPatch(text, findSkinPatch(character, skinId));
  text = patched.text;

  // builder 8：补丁把 `Resources` 里的映射指到某个条目时，那个条目本体要从随包的皮肤
  // bin 里搬进 base bin（props 的解析只认自己这个 bin）。键来自补丁自己的映射目标，
  // 不是「凡是能解析到的都搬」—— 那会把整份粒子内嵌回 base bin。
  const sourceTexts: { label: string; text: string }[] = gatedText
    ? [{ label: `skin${skinId}.bin`, text: gatedText }]
    : [];
  const patchEntries = Object.values(findSkinPatch(character, skinId)?.resourceMap?.set ?? {});
  const resolved = copyResolvedEntries(text, sourceTexts, { keys: patchEntries });
  text = resolved.text;
  // builder 8：伴随系统合并（游戏把同一个技能特效拆成多个系统，条件只能挂一个）
  const composed = composeEmitters(
    text,
    sourceTexts,
    findSkinPatch(character, skinId)?.composeEntries ?? []
  );
  text = composed.text;
  const unresolved = findUnresolvedResourceRefs(text, sourceTexts);

  fs.writeFileSync(pyPath, text, 'utf-8');

  log(
    ` [base-slot] ${character}: bin 只留 ${propsKey} + ${resourceKey}` +
      `（去掉 ${stripped.removed.length} 个内嵌条目），` +
      `linked 补 ${relinked.added.length} 条` +
      `${noId.removed.length > 0 ? '，去掉 championSkinId' : ''}` +
      `${parent.added.length > 0 ? '，补 skinParent=0' : ''}` +
      `${idleDropped.length > 0 ? `，删 ${idleDropped.length} 条挂点不存在的 idle 特效` : ''}` +
      `${patched.added.length > 0 ? `，套用 ${character} 专属补丁 ${patched.added.length} 块（${patched.added.join('；')}）` : ''}` +
      `${resolved.copied.length > 0 ? `，按 hash 搬进 ${resolved.copied.length} 个条目（${resolved.copied.map((item) => `${item.key} ${item.className}`).join('、')}）` : ''}` +
      `${composed.merged.length > 0 ? `，合并伴随系统的 emitter（${composed.merged.map((item) => `${item.key} ← ${item.from.join('、')}`).join('；')}）` : ''}`
  );
  if (unresolved.length > 0) {
    log(
      ` [base-slot] ${character}: Resources 有 ${unresolved.length} 个 value 指向本包其它 bin 的条目` +
        `（${unresolved
          .slice(0, 4)
          .map((ref) => `${ref.value} ${ref.className}`)
          .join('、')}${unresolved.length > 4 ? '…' : ''}）` +
        `，props 解析不到；需要的话用补丁的 resourceMap.set 点名才会搬进来`
    );
  }
  if (idleDropped.length > 0) {
    log(` [base-slot] ${character}: 删掉的 idle 特效 ${idleDropped.slice(0, 8).join('、')}`);
  }
};

const packToWad = async (skinFolderPath, heroName, skinId, heroId) => {
  try {
    // 先删掉旧包：这次构建如果失败，不能留一个上次的（哪怕是 335 字节的空包）
    // 冒充构建成功 —— autoBuildSkin 是靠「zip 在不在」判断成功与否的。
    fs.rmSync(path.join(OUTPUT_WAD_BASE_DIR, `${heroId}`, `${heroId}_${skinId}.zip`), {
      force: true,
    });
    // 打包目录里一个 .bin 都没有 = 前面的 py→bin 转换失败了（工具报错被 runCommand 吞掉）。
    // 这时候 wad-make 仍会写出一个 272 字节的空 WAD，zip 只有 335 字节，LTK 导入后
    // 覆盖数是 0，游戏里什么都不换 —— 不如直接报错，不写空包。
    const packedBins = fs.existsSync(skinFolderPath)
      ? (fs.readdirSync(skinFolderPath, { recursive: true }) as string[]).filter(
          (file) => typeof file === 'string' && file.toLowerCase().endsWith('.bin')
        )
      : [];
    if (packedBins.length === 0) {
      logData(` [封包失败] ${skinFolderPath}: 没有生成任何 .bin（转换失败？），不写空 WAD`);
      return null;
    }
    // 构建输出的 WAD 文件路径，例如: ...\annie\skin1\1.wad.client
    const wadName = `${heroId}_${skinId}`;
    const outputWadPath = path.join(OUTPUT_WAD_BASE_DIR, `${wadName}.wad.client`);

    // 这里的路径结构必须严格按照 wad-make 的参数要求：
    // 参数1: 要打包的源文件夹路径
    // 参数2: 输出的 WAD 文件路径
    // 注意：路径带空格时务必使用双引号包裹 `${MOD_TOOLS_PATH}\\wad-make.exe`;
    const command = Path.join(MOD_TOOLS_PATH, 'wad-make.exe');

    logData(` [正在封包] 生成 WAD: ${outputWadPath}`);
    await runCommand(command, true, skinFolderPath, outputWadPath);

    // 空目录打出来的 WAD 只有 272 字节：宁可报错也不让这种包被当成正常包导入 LTK
    const wadSize = fs.existsSync(outputWadPath) ? fs.statSync(outputWadPath).size : 0;
    if (wadSize < 1024) {
      logData(` [封包失败] ${wadName}: WAD 只有 ${wadSize} 字节（源目录是空的？），已删除`);
      fs.rmSync(outputWadPath, { force: true });
      return null;
    }

    await createZipFile(wadName, outputWadPath, heroName, heroId);
    return outputWadPath;
  } catch (err) {
    logData(` [封包失败] ${skinFolderPath}:`, err.message);
  }
};
export const createZipFile = async (wadName, outWadFilePath, heroName, heroId) => {
  try {
    // 1. 确保输出目录存在
    if (!fs.existsSync(OUTPUT_WAD_BASE_DIR)) {
      fs.mkdirSync(OUTPUT_WAD_BASE_DIR, { recursive: true });
    }

    const zip = new AdmZip();

    // 2. 添加 info.json (直接从内存添加字符串)
    const info = {
      Author: 'lzf',
      Description: 'xxxx',
      Name: wadName,
      Version: 'Patch 16.4.1',
    };
    zip.addFile('META/info.json', Buffer.from(JSON.stringify(info, null, 2), 'utf8'));

    // 3. 添加 WAD 文件 (读取本地文件并指定压缩包内路径)
    if (fs.existsSync(outWadFilePath)) {
      // 注意：addLocalFile 第一个参数是源文件，第二个参数是压缩包内的【目录】
      // 为了精确控制文件名，我们使用 addFile
      const wadBuffer = fs.readFileSync(outWadFilePath);
      zip.addFile(`WAD/${heroName}.wad.client`, wadBuffer);
    } else {
      throw new Error(`源文件不存在: ${outWadFilePath}`);
    }

    // 4. 写入磁盘 (writeZip 是同步的，或者提供回调)
    const zipPath = Path.join(OUTPUT_WAD_BASE_DIR, heroId, `${wadName}.zip`);

    // 我们将其包装成 Promise 确保执行流可控
    await new Promise((resolve, reject) => {
      zip.writeZip(zipPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(` [ZIP完成] ${wadName}.zip`);
          resolve(zipPath);
        }
      });
    });

    deleteFile(outWadFilePath);
    return zipPath;
  } catch (err) {
    console.error(` [ZIP失败] ${wadName}:`, err.message);
    throw err;
  }
};
const getHeroName = (fullWadPath: string) => {
  return path.basename(fullWadPath, path.extname(fullWadPath)).split('.')[0];
};
/**
 * 准备好这个 WAD 里要用的 bin。
 *
 * `targeted` 为真时先试「定向解包」：只按路径哈希取 `data/characters/<角色>/skins/skin<n>.bin`
 * （几十 KB，实测 50 ms），失败再退回全量解包（wad-extract.exe 要解 144 MB）。
 * 生成皮肤走定向解包；「把 WAD 拆开看一眼」那种工具函数仍然全量解包。
 */
const doUnpackWadFile = async (
  fullWadPath: string,
  currentExtraPath: string,
  sendPregress = false,
  wantedSkinIds?: number[],
  targeted = false
) => {
  if (targeted) {
    const startedAt = Date.now();
    try {
      const entries = await discoverWadSkinBins({
        wadPath: fullWadPath,
        skinBinIndexPath: resolveSkinBinIndexPath(MOD_TOOLS_PATH),
        log: sendPregress ? logData : undefined,
      });
      if (entries.length > 0) {
        // base 皮肤（skin0）要留着读身份/音频，其余只取这次要生成的皮肤
        const wanted =
          wantedSkinIds && wantedSkinIds.length > 0
            ? entries.filter(
                (entry) =>
                  /\/skin0\.bin$/.test(entry.filePath) ||
                  wantedSkinIds.some((id) => entry.filePath.endsWith(`/skin${id}.bin`))
              )
            : entries;
        const result = await extractWadFiles({
          wadPath: fullWadPath,
          files: wanted,
          outputDir: currentExtraPath,
        });
        if (result.success) {
          logData(
            ` [定向解包] ${wanted.length}/${entries.length} 个皮肤 bin，` +
              `用时 ${Date.now() - startedAt} ms`
          );
          return;
        }
        logData(' [定向解包] 有文件没取到，退回全量解包');
      } else {
        // 索引是随包带的静态文件，游戏更新出了新英雄/新皮肤后要重新生成
        logData(
          ` [定向解包] ${Path.basename(fullWadPath)} 不在皮肤索引里` +
            '（索引可能过期：npm run index:gen）'
        );
      }
    } catch (error) {
      logData(` [定向解包] 失败，退回全量解包: ${error?.message ?? error}`);
    }
  }

  if (IS_USE_COMMAND) {
    await runCommand(
      Path.join(MOD_TOOLS_PATH, 'wad-extract.exe'),
      sendPregress,
      fullWadPath,
      currentExtraPath
    );
    return;
  }
  await extractWadSkinBins({
    wadPath: fullWadPath,
    skinBinIndexPath: resolveSkinBinIndexPath(MOD_TOOLS_PATH),
    outputDir: currentExtraPath,
    logFlag: sendPregress,
  });
};
export const unpackWadFile = async (fullWadPath) => {
  const heroName = getHeroName(fullWadPath);
  const currentExtraPath = Path.join(EXTRACT_BASE_DIR, heroName);
  emptyDir(currentExtraPath);
  await doUnpackWadFile(fullWadPath, currentExtraPath, true);

  logData(` [解压完成] ${fullWadPath}`);
};
/**
 * 同一个英雄的构建必须串行：解包目录（`EXTRACT_BASE_DIR/<英雄>`）和输出目录
 * （`OUTPUT_BASE_DIR/<英雄>`）都是按英雄分的，每次构建开头还会 `emptyDir` 清空它们。
 * 「加载全部皮肤」/批量生成时同一个英雄的几个皮肤会同时构建（例如索娜 37_75 和
 * 37_77），后一个把前一个刚写好的 bin 清掉，前一个就封出一个 272 字节的空 WAD
 * （zip 只有 335 字节），LTK 看到 0 个覆盖文件，游戏里什么都不换。
 */
const championBuildLocks = new Map<string, Promise<unknown>>();

export const loadSkinDataByFile = async (
  idNameMap: Record<string, any>,
  fullWadPath: string,
  nameIdMap_?: Record<string, any>,
  currentSkinId = -1,
  cb?: Function,
  /** 构建进度回调（0~100 + 当前阶段说明），给构建窗口用 */
  onProgress?: (percent: number, message: string) => void
) => {
  const champion = getHeroName(fullWadPath).toLowerCase();
  const previous = championBuildLocks.get(champion) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => buildSkinDataByFile(idNameMap, fullWadPath, nameIdMap_, currentSkinId, cb, onProgress));
  championBuildLocks.set(champion, task);
  task
    .catch(() => undefined)
    .finally(() => {
      if (championBuildLocks.get(champion) === task) {
        championBuildLocks.delete(champion);
      }
    });
  return task;
};

const buildSkinDataByFile = async (
  idNameMap: Record<string, any>,
  fullWadPath: string,
  nameIdMap_?: Record<string, any>,
  currentSkinId = -1,
  cb?: Function,
  /** 构建进度回调（0~100 + 当前阶段说明），给构建窗口用 */
  onProgress?: (percent: number, message: string) => void
) => {
  if (!fs.existsSync(fullWadPath)) {
    MessageUtil.error(`文件不存在: ${fullWadPath}`);
    return;
  }
  const heroName = getHeroName(fullWadPath);
  const currentExtraPath = Path.join(EXTRACT_BASE_DIR, heroName);
  const currentOutPutBaseDir = Path.join(OUTPUT_BASE_DIR, heroName);
  emptyDir(currentExtraPath);
  emptyDir(currentOutPutBaseDir);
  const nameIdMap = nameIdMap_ || {};
  if (!nameIdMap_) {
    Object.keys(idNameMap).forEach((key: string) => {
      nameIdMap[idNameMap[key]] = key;
    });
  }

  const heroId = nameIdMap[heroName];
  if (!heroId) {
    logData(` [错误] 找不到英雄ID: ${heroName}`);
    MessageUtil.error(` [错误] 找不到英雄ID: ${heroName}`);
    return;
  }
  logData(` [正在解压] ${fullWadPath}`);
  await doUnpackWadFile(
    fullWadPath,
    currentExtraPath,
    false,
    currentSkinId > -1 ? [currentSkinId] : undefined,
    true
  );
  logData(` [解压完成] ${fullWadPath}`);
  onProgress?.(15, '解包完成');
  // 4. 定位英雄目录 (data/characters/XXXX)
  const charactersDir = path.join(currentExtraPath, 'data', 'characters');
  if (!fs.existsSync(charactersDir)) {
    logData(` [错误] 没有解出任何皮肤 bin：皮肤索引可能过期，先运行 npm run index:gen`);
    return;
  }
  const heroes = fs.readdirSync(charactersDir).filter((f) => {
    return fs.statSync(path.join(charactersDir, f)).isDirectory();
  });
  // 获取该 WAD 里的英雄名（如 annie）
  let skinId = Math.max(currentSkinId, 0);
  // 每个皮肤生成后做一次 LTK 名字检查（只查 WAD 同名角色，和 patcher 的检查范围一致）
  let checkChampion = '';
  let checkProblems: ReturnType<typeof checkSkinNames> = [];
  while (true) {
    let flag = false;
    checkChampion = '';
    checkProblems = [];
    const trueHeros = heroes.filter((item) => {
      return item.toUpperCase() === heroName.toUpperCase();
    })[0];
    const notifyKey = new Date().getTime();
    const findNextSkinId = (skinsDir: string, startId: number, offset = 50) => {
      let current = startId;
      while (offset > 0) {
        const binFileName = `skin${current}.bin`;
        const sourceBinPath = path.join(skinsDir, binFileName);
        if (fs.existsSync(sourceBinPath)) {
          return { binFileName, sourceBinPath, skinId_: current };
        }
        offset--;
        current++;
      }
      const binFileName = `skin${current}.bin`;
      const sourceBinPath = path.join(skinsDir, binFileName);
      // 跨 id 时只提示一次，不要每跳一个 id 弹一张通知
      if (current !== startId) {
        NotifyMsgUtil.sendNotifyMsg('[发现跨id皮肤]', sourceBinPath, `${notifyKey}`);
      }
      return { binFileName, sourceBinPath, skinId_: current };
    };
    const trueHerosDir = path.join(charactersDir, trueHeros, 'skins');
    const allFilesLength = fs.readdirSync(trueHerosDir).length;
    const { sourceBinPath, skinId_ } = findNextSkinId(trueHerosDir, skinId, 50);
    skinId = skinId_;
    if (!fs.existsSync(sourceBinPath)) {
      // 批量模式（currentSkinId = -1）走到这里就是正常结束；单个皮肤找不到才是异常
      if (currentSkinId > 0) {
        logData(` [未找到] ${heroName} 的 skin${currentSkinId}（往上找了 50 个 id 都没有 bin）`);
        logData(' [提示] 新皮肤可能还没进随包索引：npm run index:gen 重新生成后重试');
      }
      break;
    }

    // 一次批量把「本皮肤 + base 皮肤」的 bin 转成 py：
    // 一个皮肤里几个角色加起来 4~8 个 bin，逐个起进程要 8 × 150 ms，批量一次就够
    const ritobinWork = path.join(OUTPUT_BASE_DIR, heroName, '_ritobin', `skin${skinId}`);
    fs.rmSync(ritobinWork, { recursive: true, force: true });
    const skinPyOf = new Map<string, string>();
    const basePyOf = new Map<string, string>();
    for (const heroNameInLine of heroes) {
      const characterSkinsDir = path.join(charactersDir, heroNameInLine, 'skins');
      const skinBin = path.join(characterSkinsDir, `skin${skinId}.bin`);
      if (!fs.existsSync(skinBin)) {
        continue;
      }
      const skinWork = path.join(ritobinWork, 'skin', heroNameInLine);
      fs.mkdirSync(skinWork, { recursive: true });
      fs.copyFileSync(skinBin, path.join(skinWork, `skin${skinId}.bin`));
      skinPyOf.set(heroNameInLine, path.join(skinWork, `skin${skinId}.py`));

      const baseBin = path.join(characterSkinsDir, 'skin0.bin');
      if (fs.existsSync(baseBin)) {
        const baseWork = path.join(ritobinWork, 'base', heroNameInLine);
        fs.mkdirSync(baseWork, { recursive: true });
        fs.copyFileSync(baseBin, path.join(baseWork, 'skin0.bin'));
        basePyOf.set(heroNameInLine, path.join(baseWork, 'skin0.py'));
      }
    }
    const ritobinRunner = (args: string[]) =>
      runCommand(ritobinToolPath(), false, ...args);
    if (skinPyOf.size > 0) {
      const converted = await convertBinsToPy(ritobinRunner, ritobinWork, logData);
      logData(
        ` [ritobin] 批量解包 ${converted.count} 个 bin，用时 ${converted.elapsedMs} ms` +
          `${converted.slimHashes ? '（精简名字表）' : '（默认名字表）'}`
      );
    }
    onProgress?.(35, 'bin 转换完成');

    // 一份皮肤里几个角色（vayne / jade_vayne）共用语音 bank，sidecar 要累计它们
    const sidecarRegistry = createSidecarRegistry();
    const inLineNames = Array.from(skinPyOf.keys());
    for (const heroNameInLine of heroes) {
      const skinsDir = path.join(charactersDir, heroNameInLine, 'skins');
      let binFileName = `skin${skinId}.bin`;
      let sourceBinPath = path.join(skinsDir, binFileName);
      if (!fs.existsSync(skinsDir)) {
        continue;
      }
      // 5. 递增探测 SkinId
      // 如果找不到当前 ID 的文件，跳出循环去处理下一个英雄
      if (!fs.existsSync(sourceBinPath)) {
        continue;
      }
      logData(` [正在处理] 英雄名字 ${heroName} ${heroNameInLine} 皮肤id ${skinId}`);
      const lineIndex = Math.max(0, inLineNames.indexOf(heroNameInLine));
      const lineCount = Math.max(1, inLineNames.length);
      onProgress?.(45 + Math.round((lineIndex / lineCount) * 40), `改写 ${heroNameInLine}`);
      // 6. 创建两级目录结构: 英雄名 -> 皮肤ID
      // 路径示例: C:\Users\18074\Downloads\annie\skin1\data\characters\annie\skins
      const targetSkinDir = path.join(
        OUTPUT_BASE_DIR,
        heroName,
        `skin${skinId}\\data\\characters\\${heroNameInLine}\\skins`
      );
      if (!fs.existsSync(targetSkinDir)) {
        fs.mkdirSync(targetSkinDir, { recursive: true });
      }

      // 7. 直接用批量转换好的 py（bin 不再复制，也不再单独起 ritobin）
      const pyPath = path.join(targetSkinDir, 'skin0.py');
      const preparedPy = skinPyOf.get(heroNameInLine);
      if (!preparedPy || !fs.existsSync(preparedPy)) {
        logData(` [跳过] ${heroNameInLine} skin${skinId} 没有预转换的 py`);
        continue;
      }
      fs.copyFileSync(preparedPy, pyPath);
      logData(` [复制完成] ${preparedPy} -> ${pyPath}`);
      patchPyFile(heroNameInLine, pyPath, skinId);
      logData(` [处理完成 py文件修改] ${pyPath}`);
      // 按 Rose 的方式补 base skin 身份：复制 SKN/SKL 到 base 路径 + 改 championSkinName/骨架引用，
      // 否则 LTK 的 patcher 会把这个皮肤当成 skinhack，整局 overlay 被关掉。
      const baseSkin = await readBaseSkinData(
        path.join(charactersDir, heroNameInLine, 'skins', 'skin0.bin'),
        heroNameInLine,
        basePyOf.get(heroNameInLine)
      );
      if (baseSkin.name) {
        const packDir = path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`);
        const meshRefs = readSkinMeshRefs(pyPath);
        const assets = await extractWadAssets(fullWadPath, meshRefs, currentExtraPath, '网格');

        // 音效别名：把皮肤 bank 里的事件补上 base 名字的别名，保住皮肤自己的音效。
        // 拿不到 bank / 没有可合并的 tag 时，退回「整段换成 base 皮肤语音」。
        let audioBlocks = baseSkin.audio ?? undefined;
        if (baseSkin.audio) {
          const pyText = fs.readFileSync(pyPath, 'utf-8');
          const bankRefs = collectBankPaths(pyText, baseSkin.audio);
          const voiceRefs = collectVoiceBankPaths(pyText);
          const bankBytes = await extractWadAssets(fullWadPath, bankRefs, currentExtraPath, 'bank');
          const voiceBytes = await extractWadAssetsFromLocales(fullWadPath, voiceRefs);
          for (const [key, value] of voiceBytes) {
            bankBytes.set(key, value);
          }
          const plan = await planBankAliases({
            pyText,
            character: heroNameInLine,
            baseAudio: baseSkin.audio,
            sidecars: sidecarRegistry,
            readBank: async (bankPath) =>
              bankBytes.get(bankPath.replace(/\\/g, '/').toLowerCase()) ?? null,
            log: logData,
          });
          if (plan) {
            audioBlocks = plan.blocks;
            for (const file of plan.files) {
              const target = path.join(packDir, file.path);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, file.data);
            }
            logData(
              ` [base-skin] ${heroNameInLine}: 音效别名 ${plan.aliasedEvents} 个` +
                `，语音别名 ${plan.voiceAliases} 个（${plan.voiceUnits.join(', ') || '无'}）` +
                `${plan.missingEvents > 0 ? `，${plan.missingEvents} 个事件在 bank 里找不到` : ''}` +
                `，单位 ${plan.renamedUnits.map((unit) => `${unit.from}->${unit.to}`).join(', ') || '不改名'}` +
                `，随包 bank ${plan.files.length} 个`
            );
            for (const note of plan.notes.slice(0, 5)) {
              logData(` [base-skin] ${heroNameInLine}: ${note}`);
            }
          } else {
            logData(` [base-skin] ${heroNameInLine}: 补不了音效/语音别名，音频整段换成 base 皮肤的`);
          }
        }

        const rebase = rebaseSkinPy({
          pyPath,
          character: heroNameInLine,
          baseChampionSkinName: baseSkin.name,
          skinId,
          baseSkeleton: baseSkin.mesh.skeleton,
          baseSimpleSkin: baseSkin.mesh.simpleSkin,
          baseClassification: baseSkin.classification,
          baseAudio: audioBlocks,
          extractRoot: currentExtraPath,
          assets,
          outputRoot: packDir,
          log: logData,
        });
        if (rebase) {
          logData(
            ` [base-skin] 已重建网格: ${rebase.meshes
              .map((item) => `${item.path}(${item.added})`)
              .join(', ')}`
          );
          // 动画图也要跟着换成 base 皮肤的名字：皮肤自己的动作在 `animations/skin<N>.bin`，
          // base 皮肤读的是 `animations/skin0.bin`，不随包的话传说皮肤走路没有动画。
          await rebaseSkinAnimationGraph({
            pyPath,
            character: heroNameInLine,
            packDir,
            fullWadPath,
            extractRoot: currentExtraPath,
          });
          // gear 数据被去掉时，把第一档 gear 的枪械 submesh 补显示（否则模型上少两把枪）
          if (rebase.upgradeDropped && rebase.upgradeLinks.length > 0) {
            await revealGearSubmeshes({
              pyPath,
              link: rebase.upgradeLinks[0],
              character: heroNameInLine,
              fullWadPath,
              extractRoot: currentExtraPath,
            });
          }
          // builder 7：base-slot 外壳（只留身份 + Resources、皮肤 bin 随包、linked 并集、
          // 删挂点不存在的 idle 特效）。理由见 skin-base-slot.ts 文件头。
          const skeletonMesh = rebase.meshes.find((item) =>
            item.path.toLowerCase().endsWith('.skl')
          );
          await applyBaseSlotShell({
            pyPath,
            packDir,
            character: heroNameInLine,
            skinId,
            sourcePyPath: preparedPy,
            baseLinks: baseSkin.linked,
            skeletonPath: skeletonMesh ? skeletonMesh.path : null,
            log: logData,
          });
        }
      } else {
        logData(` [base-skin] 跳过 ${heroNameInLine}：没有读到 base 皮肤名`);
      }
      // LTK 的 patcher 只查与 WAD 同名的角色目录里的 skin0.bin，这里跟着查一遍：
      // 名字没换干净（比如状态类事件）包能生成，但一进游戏 overlay 就被关掉。
      // 纯字符串扫描，几毫秒；结果写到 zip 旁边，注入前读它。
      if (heroNameInLine.toLowerCase() === heroName.toLowerCase() && fs.existsSync(pyPath)) {
        checkChampion = heroName;
        checkProblems = checkSkinNames({
          text: fs.readFileSync(pyPath, 'utf-8'),
          champion: heroName,
          base: baseSkin.name
            ? { championSkinName: baseSkin.name, audio: baseSkin.audio }
            : undefined,
        });
        logData(
          checkProblems.length === 0
            ? ` [检查] ${heroId}_${skinId} 通过 LTK 名字检查`
            : ` [检查] ${heroId}_${skinId} 会被 LTK 判 skinhack（${checkProblems.length} 处）：` +
                describeSkinCheck({ problems: checkProblems })
        );
      }
      const packCall = pyToBinsCall(pyPath);      await runCommand(packCall.command, true, ...packCall.args);
      logData(` [封包完成 ritobin] ${pyPath}`);
      deleteFile(pyPath);
      onProgress?.(
        45 + Math.round(((lineIndex + 1) / lineCount) * 40),
        `${heroNameInLine} 改写完成`
      );
    }
    // 批量解包用的工作目录用完就删（里面是 bin/py 副本）
    fs.rmSync(ritobinWork, { recursive: true, force: true });
    // 所有角色的语音别名攒在 registry 里，最后统一写成 sidecar bank
    const sidecarFiles = flushSidecars(sidecarRegistry);
    if (sidecarFiles.length > 0) {
      const sidecarDir = path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`);
      for (const file of sidecarFiles) {
        const target = path.join(sidecarDir, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.data);
      }
      logData(
        ` [base-skin] 语音 sidecar ${sidecarFiles.length} 个: ` +
          sidecarFiles.map((file) => `${file.path}(${file.aliases})`).join(', ')
      );
    }
    if (flag) {
      break;
    }
    onProgress?.(90, '打包中');
    await packToWad(
      path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`),
      heroName,
      skinId,
      heroId
    );
    // 检查结果写在 zip 旁边：注入前 `injectSkin` 读它，不通过就不加载
    const zipPath = path.join(OUTPUT_WAD_BASE_DIR, heroId, `${heroId}_${skinId}.zip`);
    if (fs.existsSync(zipPath)) {
      writeSkinCheck(zipPath, {
        ok: checkProblems.length === 0,
        champion: checkChampion || heroName,
        checkedAt: new Date().toISOString(),
        problems: checkProblems,
        builder: SKIN_ARCHIVE_BUILDER,
      });
    }
    onProgress?.(
      100,
      checkProblems.length === 0 ? '构建完成' : '构建完成（未通过 LTK 检查，注入会被拦住）'
    );
    if (currentSkinId > -1) {
      break;
    }
    logData(`已处理皮肤id ：${skinId} / ${allFilesLength}`);
    skinId++;
  }
  logData(`${heroName}_${heroId} 封包完成`);
  emptyDir(currentExtraPath);
  emptyDir(path.join(OUTPUT_BASE_DIR, heroName));
  deleteDir(currentExtraPath);
  deleteDir(path.join(OUTPUT_BASE_DIR, heroName));
  cb && cb(heroName, heroId);
};
export const loadSkinData = async (idNameMap: Record<string, any>, chunkSize = 20) => {
  // 1. 初始化提取目录
  const nameIdMap = {};
  Object.keys(idNameMap).forEach((key: string) => {
    nameIdMap[idNameMap[key]] = key;
  });

  // 2. 读取所有 WAD 文件
  if (!fs.existsSync(WAD_SOURCE_DIR)) {
    logData(`源目录不存在: ${WAD_SOURCE_DIR}`);
    return;
  }
  const wadFiles = fs.readdirSync(WAD_SOURCE_DIR).filter((f) => {
    const isWad = f.endsWith('.wad.client');
    const isNotLocale = !f.includes('zh_CN'); // 关键：过滤掉语言包
    return isWad && isNotLocale;
  });
  logData(`开始构建皮肤数据...分片数：${chunkSize} 文件总数：${wadFiles.length}`);
  const notifyKey = new Date().getTime();
  let count = 0;
  while (wadFiles.length > 0) {
    const sTime = Date.now();
    const wadList = wadFiles.splice(0, wadFiles.length > chunkSize ? chunkSize : wadFiles.length);
    await Promise.all(
      wadList.map((wadFile) =>
        loadSkinDataByFile(
          idNameMap,
          Path.join(WAD_SOURCE_DIR, wadFile),
          nameIdMap,
          -1,
          (heroName: string) => {
            NotifyMsgUtil.sendNotifyMsg(
              `[处理完成_${heroName}] ${++count} / ${wadFiles.length} `,
              '',
              `${notifyKey}`
            );
          }
        )
      )
    );
    const endTime = Date.now();
    logData(
      `【重要】 ${++count} / ${wadFiles.length} 个 WAD，本轮循环耗时 ${(endTime - sTime) / 1000} 秒`
    );
  }
  logData('所有英雄皮肤已按 英雄名/皮肤ID 目录分类完成。');
};
