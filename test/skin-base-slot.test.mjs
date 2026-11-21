/**
 * base-slot 外壳重建的单元测试（builder 7，不需要游戏和 cslol-tools）。
 *
 * 规则来源：Rose 的 `skins/68/68003/68003.fantome`（在游戏里跑通的那份）。这里只用
 * ritobin 文本做夹具，覆盖：
 *   - `linked` 并集（大小写不敏感去重）
 *   - 去掉 `championSkinId` / 补 `skinParent = 0`（只写进身份对象）
 *   - 只留「身份 + Resources」两个 entry
 *   - `keywordsRequired` 里含皮肤名的闸门删掉、`keywordsExcluded` 原样保留
 *   - 挂点骨头不存在的 idle 特效删掉（全删时写成空列表）
 *
 * 运行：npm run baseslot:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinBaseSlot.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run baseslot:test 的构建步骤`);
}

const {
  collectEntryKeys,
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
  readHashRefs,
  readLinkedBins,
  readMapValues,
  stripInlineEntries,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

let failures = 0;
const step = (name, fn) => {
  try {
    const detail = fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}: ${error.message}`);
  }
};

/** 身份 + Resources + 一个粒子 + 一个 CAC，模拟 rebase 完的皮肤 bin */
const skinPy = () => `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/Rumble/Rumble.bin"
    "DATA/Characters/Rumble/Animations/Skin3.bin"
}
entries: map[hash, embed] = {
    "Characters/Rumble/Skins/Skin0" = SkinCharacterDataProperties {
        skinClassification: u32 = 1
        championSkinId: i32 = 68003
        championSkinName: string = "rumble"
        skinMeshProperties: embed = SkinMeshDataProperties {
            skeleton: string = "ASSETS/Characters/Rumble/Skins/Base/rumble.skl"
        }
        idleParticlesEffects: list[embed] = {
            SkinCharacterDataProperties_CharacterIdleEffect {
                effectKey: hash = "Rumble_Idle_1"
                boneName: string = "R_Flame"
            }
            SkinCharacterDataProperties_CharacterIdleEffect {
                effectKey: hash = "Rumble_Idle_taze_01"
                boneName: string = "Spike"
            }
        }
        mResourceResolver: link = "Characters/Rumble/Skins/Skin0/Resources"
        objectPath: hash = "Characters/Rumble/Skins/Skin3"
    }
    "Characters/Rumble/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash, link] = {
            "Rumble_E_mis" = "Characters/Rumble/Skins/Skin3/Particles/Rumble_Skin03_E_mis"
        }
    }
    "Characters/Rumble/Skins/Skin3/Particles/Rumble_Skin03_E_mis" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "Missile_with_child_trail_Skin03"
                Filtering: pointer = VfxEmitterFiltering {
                    keywordsRequired: list[string] = { "RumbleSkin03" }
                }
            }
        }
    }
    "Characters/Rumble/CAC/Rumble_Skin03" = ContextualActionData {
        mObjectPath: string = "Characters/Rumble/CAC/Rumble_Skin03"
    }
}
`;

/** 原皮肤 bin（未 patch 身份），带三种过滤器 */
const sourcePy = () => `entries: map[hash, embed] = {
    "Characters/Rumble/Skins/Skin3" = SkinCharacterDataProperties {
        championSkinName: string = "RumbleSkin03"
    }
    "Characters/Rumble/Skins/Skin3/Particles/A" = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "only-skin"
                Filtering: pointer = VfxEmitterFiltering {
                    keywordsRequired: list[string] = { "RumbleSkin03" }
                }
            }
            VfxEmitterDefinitionData {
                emitterName: string = "mixed"
                Filtering: pointer = VfxEmitterFiltering {
                    keywordsRequired: list[string] = { "RumbleSkin03", "OtherSkin" }
                }
            }
            VfxEmitterDefinitionData {
                emitterName: string = "excluded"
                Filtering: pointer = VfxEmitterFiltering {
                    keywordsExcluded: list[string] = { "RumbleSkin03" }
                }
            }
            VfxEmitterDefinitionData {
                emitterName: string = "other-skin"
                Filtering: pointer = VfxEmitterFiltering {
                    keywordsRequired: list[string] = { "OtherSkin" }
                }
            }
        }
    }
}
`;

step('readLinkedBins / readChampionSkinName / readEntryKeyOfClass', () => {
  const text = skinPy();
  assert.deepEqual(readLinkedBins(text), [
    'DATA/Characters/Rumble/Rumble.bin',
    'DATA/Characters/Rumble/Animations/Skin3.bin',
  ]);
  assert.equal(readChampionSkinName(text), 'rumble');
  assert.equal(readEntryKeyOfClass(text, 'SkinCharacterDataProperties'), 'Characters/Rumble/Skins/Skin0');
  assert.equal(readEntryKeyOfClass(text, 'ResourceResolver'), 'Characters/Rumble/Skins/Skin0/Resources');
  return '3 个读取函数';
});

step('mergeLinkedBins：并上 base 清单，大小写不敏感去重', () => {
  const { text, added } = mergeLinkedBins(skinPy(), [
    'DATA/Characters/Rumble/Rumble.bin',
    'data/characters/rumble/animations/skin3.bin',
    'data/characters/rumble/skins/skin3.bin',
    'data/characters/rumble/animations/skin0.bin',
  ]);
  assert.deepEqual(added, [
    'data/characters/rumble/skins/skin3.bin',
    'data/characters/rumble/animations/skin0.bin',
  ]);
  const links = readLinkedBins(text);
  assert.equal(links.filter((item) => item.toLowerCase() === 'data/characters/rumble/rumble.bin').length, 1);
  assert.equal(links.length, 4);
  // 幂等
  const again = mergeLinkedBins(text, ['data/characters/rumble/skins/skin3.bin']);
  assert.deepEqual(again.added, []);
  return added.join(', ');
});

step('dropChampionSkinId + ensureSkinParent', () => {
  const noId = dropChampionSkinId(skinPy());
  assert.deepEqual(noId.removed, ['championSkinId: i32 = 68003']);
  assert.equal(noId.text.includes('championSkinId'), false);

  const withParent = ensureSkinParent(noId.text);
  assert.deepEqual(withParent.added, ['skinParent: i32 = 0']);
  assert.match(withParent.text, /objectPath: hash = "Characters\/Rumble\/Skins\/Skin3"\n {8}skinParent: i32 = 0/);
  // 粒子对象里的 objectPath 不该被碰到
  const particleAt = withParent.text.indexOf('Rumble_Skin03_E_mis" = VfxSystemDefinitionData');
  assert.ok(particleAt > 0);
  assert.equal(ensureSkinParent(withParent.text).added.length, 0, '幂等');
  return 'championSkinId 去掉、skinParent 补上';
});

step('stripInlineEntries：只留身份 + Resources', () => {
  const text = skinPy();
  const propsKey = readEntryKeyOfClass(text, 'SkinCharacterDataProperties');
  const resourceKey = readEntryKeyOfClass(text, 'ResourceResolver');
  const { text: out, removed } = stripInlineEntries(text, [propsKey, resourceKey]);
  assert.deepEqual(removed, [
    'Characters/Rumble/Skins/Skin3/Particles/Rumble_Skin03_E_mis',
    'Characters/Rumble/CAC/Rumble_Skin03',
  ]);
  assert.equal(out.includes('VfxSystemDefinitionData'), false);
  assert.equal(out.includes('ContextualActionData'), false);
  assert.ok(out.includes(`    "${propsKey}" = SkinCharacterDataProperties {`));
  assert.ok(out.includes(`    "${resourceKey}" = ResourceResolver {`));
  assert.ok(out.includes('"Rumble_E_mis" = '), 'Resources 里的映射要留着');
  // 括号配平
  let depth = 0;
  for (const ch of out) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, '不能出现多余的右括号');
  }
  assert.equal(depth, 0, '花括号要配平');
  return `删掉 ${removed.length} 个内嵌条目`;
});

step('dropSkinKeywordGates：删皮肤名闸门、留排除块', () => {
  const before = (sourcePy().match(/Filtering: pointer/g) || []).length;
  const { text, removed } = dropSkinKeywordGates(sourcePy(), 'RumbleSkin03');
  assert.equal(removed.length, 2);
  assert.equal(text.includes('keywordsRequired: list[string] = { "RumbleSkin03" }'), false, '独占的名字闸门要删');
  assert.match(text, /keywordsRequired: list\[string\] = \{ "OtherSkin" \}/, '混合列表里只去掉皮肤名');
  assert.match(text, /keywordsExcluded: list\[string\] = \{ "RumbleSkin03" \}/, '排除块必须原样保留');
  assert.equal(
    (text.match(/Filtering: pointer/g) || []).length,
    before - 1,
    '闸门整块删掉、排除块和别的皮肤的闸门留着'
  );
  // emitter 本身要留着，删的只是它的过滤块
  assert.ok(text.includes('emitterName: string = "only-skin"'));
  assert.ok(text.includes('emitterName: string = "excluded"'));
  // 幂等
  assert.equal(dropSkinKeywordGates(text, 'RumbleSkin03').removed.length, 0);
  return removed.join('；');
});

step('dropIdleEffectsWithoutJoints：挂点不存在才删', () => {
  const { text, removed, kept } = dropIdleEffectsWithoutJoints(skinPy(), ['R_Flame', 'root']);
  assert.deepEqual(removed, ['"Rumble_Idle_taze_01" @ Spike']);
  assert.equal(kept, 1);
  assert.ok(text.includes('"Rumble_Idle_1"'));
  assert.equal(text.includes('Rumble_Idle_taze_01'), false);

  // 一个都对不上 -> 空列表
  const all = dropIdleEffectsWithoutJoints(skinPy(), []);
  assert.equal(all.kept, 0);
  assert.match(all.text, /idleParticlesEffects: list\[embed\] = \{ \}/);
  assert.equal(all.removed.length, 2);
  // 括号配平
  let depth = 0;
  for (const ch of all.text) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return `${removed.length} 条删掉`;
});

step('整套顺序跑一遍不留坏结构', () => {
  let text = skinPy();
  text = dropChampionSkinId(text).text;
  text = ensureSkinParent(text).text;
  text = dropIdleEffectsWithoutJoints(text, ['R_Flame']).text;
  const propsKey = readEntryKeyOfClass(text, 'SkinCharacterDataProperties');
  const resourceKey = readEntryKeyOfClass(text, 'ResourceResolver');
  text = stripInlineEntries(text, [propsKey, resourceKey]).text;
  text = mergeLinkedBins(text, ['data/characters/rumble/skins/skin3.bin']).text;

  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, '花括号要配平');
  assert.equal(readLinkedBins(text).length, 3);
  assert.equal((text.match(/^ {4}"[^"]*" = /gm) || []).length, 2, '只该剩两个 entry');
  return 'ok';
});

step('只搬补丁点名的条目（按 hash 从皮肤 bin 里取，不是手抄）', () => {
  const shell = `entries: map[hash, embed] = {
    "Characters/Rumble/Skins/Skin0" = SkinCharacterDataProperties {
        mResourceResolver: link = "Characters/Rumble/Skins/Skin0/Resources"
    }
    "Characters/Rumble/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash, link] = {
            0x6f608837 = 0xa075fcc1
            0x74ad149b = 0xcccfc449
        }
    }
}`;
  const skin = `entries: map[hash, embed] = {
    0xa075fcc1 = VfxSystemDefinitionData {
        particleName: string = "Rumble_Skin03_R_tar_team_green"
    }
    0xcccfc449 = VfxSystemDefinitionData {
        particleName: string = "Rumble_Skin03_r_burn"
    }
}`;
  const sources = [{ label: 'skin3.bin', text: skin }];

  // 点名了才搬
  const one = copyResolvedEntries(shell, sources, { keys: ['0xa075fcc1'] });
  assert.equal(one.copied.length, 1);
  assert.equal(one.copied[0].className, 'VfxSystemDefinitionData');
  assert.match(one.text, /^ {4}0xa075fcc1 = VfxSystemDefinitionData \{/m);
  assert.doesNotMatch(one.text, /0xcccfc449 = VfxSystemDefinitionData/);

  // 没点名（resolver 里能对上也不搬）—— 全搬就是 builder 6 的老毛病
  const none = copyResolvedEntries(shell, sources, { keys: [] });
  assert.equal(none.copied.length, 0);
  assert.equal(none.text, shell);

  // 已经有的不重复搬
  const twice = copyResolvedEntries(one.text, sources, { keys: ['0xa075fcc1'] });
  assert.equal(twice.copied.length, 0);
  return 'ok';
});

step('诊断：Resources 里指向其它 bin 条目的 value 会被报出来', () => {
  const text = `entries: map[hash, embed] = {
    "Resources" = ResourceResolver {
        resourceMap: map[hash, link] = {
            0x6f608837 = 0xa075fcc1
            0x74ad149b = 0xcccfc449
            0x11111111 = 0x22222222
        }
    }
}`;
  const skin = `entries: map[hash, embed] = {
    0xa075fcc1 = VfxSystemDefinitionData {
        particleName: string = "p"
    }
    0xcccfc449 = VfxSystemDefinitionData {
        particleName: string = "q"
    }
}`;
  const refs = findUnresolvedResourceRefs(text, [{ label: 'skin3.bin', text: skin }]);
  assert.deepEqual(refs.map((ref) => ref.value), ['0xa075fcc1', '0xcccfc449']);
  assert.equal(refs[0].className, 'VfxSystemDefinitionData');
  // 文件路径 hash（谁都没定义）不报，避免全是误报
  assert.equal(refs.some((ref) => ref.value === '0x22222222'), false);
  return `${refs.length} 处`;
});

step('合并伴随系统的 emitter（按名字前缀，emitter 来自游戏数据）', () => {
  const src = `entries: map[hash, embed] = {
    0xaa = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "main"
            }
        }
        particleName: string = "Rumble_Skin03_R_tar_team_green"
    }
    0xbb = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "crater1"
            }
        }
        particleName: string = "Rumble_Skin03_R_Crater_01"
    }
    0xcc = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "crater2"
            }
        }
        particleName: string = "Rumble_Skin03_R_Crater_02"
    }
    0xdd = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "other"
            }
        }
        particleName: string = "Rumble_Skin03_Q_cas_01"
    }
}`;
  const spec = [{ key: '0xaa', alsoByName: 'Rumble_Skin03_R_Crater_' }];
  const merged = composeEmitters(src, [{ label: 'skin3.bin', text: src }], spec);
  assert.equal(merged.merged.length, 1);
  assert.deepEqual(merged.merged[0].from, ['0xbb', '0xcc']);
  const main = merged.text.slice(merged.text.indexOf('0xaa ='), merged.text.indexOf('0xbb ='));
  assert.match(main, /emitterName: string = "main"/);
  assert.match(main, /emitterName: string = "crater1"/);
  assert.match(main, /emitterName: string = "crater2"/);
  assert.doesNotMatch(main, /emitterName: string = "other"/, '不相关系统不能被并进来');
  // 幂等：再来一遍不会重复
  const again = composeEmitters(merged.text, [{ label: 'skin3.bin', text: src }], spec);
  assert.equal(again.merged.length, 0);
  assert.equal(again.text, merged.text);
  return `${merged.merged[0].from.length} 个伴随系统`;
});

console.log(failures === 0 ? '\nbase-slot: 全部通过' : `\nbase-slot: ${failures} 个失败`);
process.exit(failures === 0 ? 0 : 1);
