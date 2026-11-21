/**
 * 动画图（`AnimationGraphData`）改写的单元测试（不需要游戏和 cslol-tools）。
 *
 * 覆盖：链接解析（字符串形态 / 精简名字表下的哈希形态）、皮肤 bin 的链接 + `linked`
 * 清单改写、动画图 entry key / objectPath 改写、动画文件引用与事件名不动、
 * 皮肤 id 前缀不误伤（69 vs 690）、幂等。
 *
 * 哈希值来自 FNV-1a（和 ritobin 名字表一致）：
 *   `Characters/MissFortune/Animations/Skin69` = 0xf16c7bcc
 *   `Characters/MissFortune/Animations/Skin0`  = 0xa3e11b4b
 *
 * 运行：npm run anim:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinAnimation.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run anim:test 的构建步骤`);
}

const {
  readAnimationGraphLink,
  animationGraphBinRef,
  animationGraphTargetPath,
  rebaseAnimationGraphPy,
  rebaseSkinAnimationLink,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

let failures = 0;
const step = (name, fn) => {
  try {
    const detail = fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

/** 名字表命中时的皮肤 py（完整名字表） */
const SKIN_PY = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/MissFortune/MissFortune.bin"
    "DATA/Characters/MissFortune/Animations/Skin69.bin"
}
entries: map[hash, embed] = {
    "Characters/MissFortune/Skins/Skin0" = SkinCharacterDataProperties {
        championSkinId: i32 = 21069
        animationGraphData: link = "Characters/MissFortune/Animations/Skin69"
        skeleton: string = "ASSETS/Characters/MissFortune/Skins/Base/MissFortune.skl"
        mResourceResolver: link = "Characters/MissFortune/Skins/Skin0/Resources"
    }
    "Characters/MissFortune/Skins/Skin69/Particles/MissFortune_Skin69_Idle" = VfxSystemDefinitionData {
    }
}
`;

/** 生成流程实际拿到的形态：精简名字表把 entry key / 链接都印成哈希 */
const SLIM_SKIN_PY = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/MissFortune/MissFortune.bin"
    "DATA/Characters/MissFortune/Animations/Skin69.bin"
}
entries: map[hash, embed] = {
    "Characters/MissFortune/Skins/Skin0" = SkinCharacterDataProperties {
        championSkinId: i32 = 21069
        animationGraphData: link = 0xf16c7bcc
        skeleton: string = "ASSETS/Characters/MissFortune/Skins/Base/MissFortune.skl"
    }
}
`;

/** 名字表命中时的动画图 py */
const GRAPH_PY = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = { }
entries: map[hash, embed] = {
    "Characters/MissFortune/Animations/Skin69" = AnimationGraphData {
        mClipDataMap: map[hash, pointer] = {
            "Run_Base" = AtomicClipData {
                mEventDataMap: map[hash, pointer] = {
                    0x7434fce3 = ParticleEventData {
                        mEffectKey: hash = "MissFortune_Skin69_Emote_Death"
                    }
                }
                mAnimationResourceData: embed = AnimationResourceData {
                    mAnimationFilePath: file = "assets/characters/missfortune/skins/skin69/animations/run.anm"
                }
            }
        }
        objectPath: hash = "Characters/MissFortune/Animations/Skin69"
    }
}
`;

/** 生成流程实际拿到的动画图 py：entry key / objectPath 都是哈希 */
const SLIM_GRAPH_PY = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = { }
entries: map[hash, embed] = {
    0xf16c7bcc = animationGraphData {
        0x1e53f13e: f32 = 0
        0x45e122f8: map[hash, pointer] = {
            0x19efbfdb: string = "assets/characters/missfortune/skins/skin69/animations/run.anm"
        }
        0x1d369c29: hash = 0xf16c7bcc
    }
}
`;

step('读链接：皮肤 bin 里的动画图', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  assert.ok(link, '应该读到链接');
  assert.equal(link.link, 'Characters/MissFortune/Animations/Skin69');
  assert.equal(link.hero, 'MissFortune');
  assert.equal(link.skin, 69);
  return `${link.hero} ${link.skin}`;
});

step('读链接：精简名字表下（链接是哈希）从 linked 清单里读', () => {
  const link = readAnimationGraphLink(SLIM_SKIN_PY);
  assert.ok(link, '应该从 linked 清单读到');
  assert.equal(link.link, 'Characters/MissFortune/Animations/Skin69');
  assert.equal(link.skin, 69);
});

step('读链接：已经指向 base 时是 Skin0', () => {
  const link = readAnimationGraphLink(
    SKIN_PY.replaceAll('Animations/Skin69', 'Animations/Skin0')
  );
  assert.ok(link);
  assert.equal(link.skin, 0);
});

step('读链接：没有这个字段 / 形状不对时返回 null', () => {
  assert.equal(readAnimationGraphLink('entries: map[hash, embed] = { }\n'), null);
  assert.equal(
    readAnimationGraphLink('animationGraphData: link = "Characters/MissFortune/Skins/Skin69"'),
    null
  );
});

step('WAD 路径 / 打包路径', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  assert.equal(
    animationGraphBinRef(link),
    'DATA/Characters/MissFortune/Animations/Skin69.bin'
  );
  assert.equal(
    animationGraphTargetPath('missfortune'),
    'data/characters/missfortune/animations/skin0.bin'
  );
});

step('皮肤 bin：链接和 linked 清单都改到 Skin0', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  const { text, replaced } = rebaseSkinAnimationLink(SKIN_PY, link);
  assert.deepEqual(replaced, ['animationGraphData', 'linked']);
  assert.match(text, /animationGraphData: link = "Characters\/MissFortune\/Animations\/Skin0"/);
  assert.match(text, /"DATA\/Characters\/MissFortune\/Animations\/Skin0\.bin"/);
  assert.doesNotMatch(text, /Animations\/Skin69\.bin/);
  // 皮肤自己那份数据里的粒子条目一个字母都不能动
  assert.match(text, /"Characters\/MissFortune\/Skins\/Skin69\/Particles\/MissFortune_Skin69_Idle"/);
  // 别的 bin 不动
  assert.match(text, /"DATA\/Characters\/MissFortune\/MissFortune\.bin"/);
});

step('皮肤 bin：链接是哈希时换成 Skin0 的哈希', () => {
  const link = readAnimationGraphLink(SLIM_SKIN_PY);
  const { text, replaced } = rebaseSkinAnimationLink(SLIM_SKIN_PY, link);
  assert.deepEqual(replaced, ['animationGraphData', 'linked']);
  assert.match(text, /animationGraphData: link = 0xa3e11b4b/);
  assert.match(text, /"DATA\/Characters\/MissFortune\/Animations\/Skin0\.bin"/);
  assert.doesNotMatch(text, /0xf16c7bcc/);
});

step('皮肤 bin：重复改写不会变成 Skin00', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  const once = rebaseSkinAnimationLink(SKIN_PY, link).text;
  const twice = rebaseSkinAnimationLink(once, link).text;
  assert.equal(twice, once);
  assert.doesNotMatch(twice, /Skin00/);
});

step('动画图：entry key 和 objectPath 改成 Skin0（字符串形态）', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  const { text, replaced } = rebaseAnimationGraphPy(GRAPH_PY, link);
  assert.equal(replaced, 2);
  assert.match(text, /^ {4}"Characters\/MissFortune\/Animations\/Skin0" = AnimationGraphData \{/m);
  assert.match(text, /objectPath: hash = "Characters\/MissFortune\/Animations\/Skin0"/);
  assert.doesNotMatch(text, /Animations\/Skin69"/);
});

step('动画图：entry key 和 objectPath 改成 Skin0（哈希形态）', () => {
  const link = readAnimationGraphLink(SLIM_SKIN_PY);
  const { text, replaced } = rebaseAnimationGraphPy(SLIM_GRAPH_PY, link);
  assert.equal(replaced, 2);
  assert.match(text, /0xa3e11b4b = animationGraphData \{/);
  assert.match(text, /0x1d369c29: hash = 0xa3e11b4b/);
  assert.doesNotMatch(text, /0xf16c7bcc/);
});

step('动画图：.anm 路径和事件名保持原样', () => {
  const link = readAnimationGraphLink(SKIN_PY);
  const { text } = rebaseAnimationGraphPy(GRAPH_PY, link);
  assert.match(
    text,
    /mAnimationFilePath: file = "assets\/characters\/missfortune\/skins\/skin69\/animations\/run\.anm"/
  );
  assert.match(text, /mEffectKey: hash = "MissFortune_Skin69_Emote_Death"/);
});

step('动画图：皮肤 id 前缀不误伤（69 不该改 690）', () => {
  const text = GRAPH_PY.replace(
    'objectPath: hash = "Characters/MissFortune/Animations/Skin69"',
    'objectPath: hash = "Characters/MissFortune/Animations/Skin690"'
  );
  const link = readAnimationGraphLink(SKIN_PY);
  const rebased = rebaseAnimationGraphPy(text, link).text;
  assert.match(rebased, /"Characters\/MissFortune\/Animations\/Skin0" = AnimationGraphData/);
  assert.match(rebased, /objectPath: hash = "Characters\/MissFortune\/Animations\/Skin690"/);
});

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log('\n动画图改写测试全部通过');
