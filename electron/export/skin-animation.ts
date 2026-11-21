/**
 * 皮肤动画图（`AnimationGraphData`）的 base 改写。
 *
 * 来源：Rose 的皮肤包。以 `D:\projects\LeagueSkins\skins\21\21069\21069.fantome`
 * （21 = MissFortune，skin69）为例，包里除了 `skins/skin0.bin` + base 路径的
 * SKN/SKL + 声音 bank 之外，还多一个
 *
 *   data/characters/missfortune/animations/skin0.bin
 *
 * 内容是游戏里 `animations/skin69.bin` 那份动画图，只把 entry key 和 objectPath
 * 里的 `Characters/MissFortune/Animations/Skin69` 改成 `.../Skin0`；皮肤 bin 里的
 * `animationGraphData` 链接、以及 `linked` 清单里那一行，也一起指到 Skin0。
 * 对比我们的包和它的包：SKN/SKL 逐字节相同、skin0.bin 除了它自己改的主题粒子也一样 ——
 * 差的就是这份动画图。所以这里照做（Rose 的 `injection/baseskin/steps.py` 只改
 * 网格/骨架/名字/音频，动画图是他们出包流程另外补的）。
 *
 * 为什么需要：皮肤 bin 里 `animationGraphData: link = "Characters/<英雄>/Animations/Skin<N>"`
 * 指向 **皮肤自己** 的动画图。传说/终极这类皮肤有自己的动作（`run.anm` 等），
 * 改成 base 皮肤后游戏拿 base 那份动画图（`animations/skin0.bin`）去驱动模型，
 * 动作对不上，走起来就滑步 / 不播走路动画。把皮肤自己的动画图换个名字塞进包里，
 * 动作才对得上。
 *
 * `.anm` 文件的引用保持原样（`assets/characters/<角色>/skins/skin<N>/animations/*`）：
 * 那些文件游戏 WAD 里本来就有，不用随包（Rose 的包也是这样）。
 *
 * 注意 ritobin 的两种文本形态：
 *   - 名字表里有这条路径时印成字符串：`link = "Characters/<英雄>/Animations/Skin<N>"`、
 *     `objectPath: hash = "Characters/..."`；
 *   - 没有时印成 FNV-1a 哈希（生成流程用的是精简名字表，就是这种）：
 *     `link = 0xf16c7bcc`、`0x1d369c29: hash = 0xf16c7bcc`。
 * 两种都要改，所以这里按「路径」和「路径哈希」两个 token 换。
 */

import { ritobinHash } from './ritobin';

/** 皮肤 bin 里的动画图链接（`Characters/<英雄>/Animations/Skin<N>`） */
export interface AnimationGraphLink {
  /** 原样的链接字符串，例如 `Characters/MissFortune/Animations/Skin69` */
  link: string;
  /** 链接里的英雄段，大小写照抄（`MissFortune`），用来拼 WAD 路径 */
  hero: string;
  /** 动画图的皮肤 id（69）；0 表示本来就是 base 的动画图 */
  skin: number;
}

const LINK_SHAPE = /^Characters\/([^/]+)\/Animations\/Skin(\d+)$/i;
/** 完整字符串形态的链接（名字表命中时） */
const STRING_LINK = /link\s*=\s*"(Characters\/[^"]+\/Animations\/Skin\d+)"/gi;
/** `linked` 清单里的依赖（一直是完整字符串，精简名字表下也读得到） */
const LINKED_BIN = /"DATA\/(Characters\/[^/]+\/Animations\/Skin\d+)\.bin"/i;

const shapeOf = (link: string): AnimationGraphLink | null => {
  const shape = LINK_SHAPE.exec(link);
  return shape ? { link, hero: shape[1], skin: Number(shape[2]) } : null;
};

/**
 * 读皮肤 bin 的 py 里的动画图链接；没有 / 不是这个形状就返回 null。
 *
 * 先找能看懂的字符串；读不到（精简名字表把链接印成哈希）就退回 `linked` 清单 ——
 * 那份依赖一直是完整路径，和 `animationGraphData` 指的是同一个 bin。
 */
export const readAnimationGraphLink = (text: string): AnimationGraphLink | null => {
  for (const matched of text.matchAll(STRING_LINK)) {
    const found = shapeOf(matched[1]);
    if (found) {
      return found;
    }
  }
  const linked = LINKED_BIN.exec(text);
  return linked ? shapeOf(linked[1]) : null;
};

/** 游戏 WAD 里皮肤自己那份动画图的路径（`DATA/Characters/<英雄>/Animations/Skin<N>.bin`） */
export const animationGraphBinRef = (link: AnimationGraphLink): string =>
  `DATA/${link.link}.bin`;

/** 包里要放的动画图（相对打包目录） */
export const animationGraphTargetPath = (character: string): string =>
  `data/characters/${character}/animations/skin0.bin`;

/** 这条链接换成 base 皮肤的同名动画图（只换末尾皮肤号） */
export const animationGraphTargetLink = (link: AnimationGraphLink): string =>
  link.link.replace(/Skin\d+$/i, 'Skin0');

/** py 里同一个路径的两种写法：`"路径"` 和 `0x路径哈希` */
const linkTokens = (link: string): Array<[string, string]> => [
  [`"${link}"`, `"${link.replace(/Skin\d+$/i, 'Skin0')}"`],
  [`0x${ritobinHash(link)}`, `0x${ritobinHash(link.replace(/Skin\d+$/i, 'Skin0'))}`],
];

/**
 * 改写动画图的 py：entry key 和 objectPath 里的 `Animations/Skin<N>` → `Animations/Skin0`。
 *
 * 只动「这个路径本身的字符串 / 哈希」，`mAnimationFilePath`（`...skin69/animations/x.anm`）、
 * `mEffectKey` / `mSoundName`（`MissFortuneSkin69_...`）都不碰 —— 那些是皮肤资产的名字，
 * 引用还在同一份皮肤数据里，改了反而找不到。
 */
export const rebaseAnimationGraphPy = (
  text: string,
  link: AnimationGraphLink
): { text: string; replaced: number } => {
  let next = text;
  let replaced = 0;
  for (const [from, to] of linkTokens(link.link)) {
    const pieces = next.split(from);
    if (pieces.length > 1) {
      replaced += pieces.length - 1;
      next = pieces.join(to);
    }
  }
  return { text: next, replaced };
};

/**
 * 改写皮肤 bin 的 py：`animationGraphData` 链接和 `linked` 清单里那一行都指到 Skin0。
 *
 * `linked` 那一行（`"DATA/Characters/<英雄>/Animations/Skin<N>.bin"`）是 bin 的依赖清单，
 * 客户端按它预载依赖；链接改了这行不改，等于说「依赖 Skin<N> 的动画图」。
 */
export const rebaseSkinAnimationLink = (
  text: string,
  link: AnimationGraphLink
): { text: string; replaced: string[] } => {
  const replaced: string[] = [];
  const target = animationGraphTargetLink(link);
  let next = text;
  // 按「值正好是这条链接」换，不依赖字段名（精简名字表下字段名可能也是哈希）
  const quoted = new RegExp(`(link\\s*=\\s*)"${link.link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
  const hashed = new RegExp(`(link\\s*=\\s*)0x${ritobinHash(link.link)}\\b`);
  if (quoted.test(next)) {
    next = next.replace(quoted, `$1"${target}"`);
    replaced.push('animationGraphData');
  } else if (hashed.test(next)) {
    next = next.replace(hashed, `$1${`0x${ritobinHash(target)}`}`);
    replaced.push('animationGraphData');
  }
  const dependency = new RegExp(`Animations/Skin${link.skin}\\.bin"`, 'g');
  if (dependency.test(next)) {
    next = next.replace(dependency, 'Animations/Skin0.bin"');
    replaced.push('linked');
  }
  return { text: next, replaced };
};
