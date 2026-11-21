/**
 * 英雄专属补丁层的单元测试（builder 8，不需要游戏和 cslol-tools）。
 *
 * 覆盖：
 *   - 没登记补丁的英雄 → `null`，`applySkinPatch` 原样返回（纯数据流程）
 *   - `propsInsert`：插到锚字段所在块之后，缩进对齐到身份对象的 8 空格
 *   - `entriesInsert`：插到 `entries` 表末尾（`0x… = VfxSystemDefinitionData { … }`）
 *   - 重复套用不再插第二遍（幂等）
 *   - 锚字段不存在 / 花括号不配平时不写出半残文本（跳过或抛错）
 *   - Rumble 的补丁确实带 R 燃烧特效（条件块 + 粒子定义）
 *
 * 运行：npm run patch:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinPatches.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run patch:test 的构建步骤`);
}

const { applySkinPatch, findSkinPatch, SKIN_PATCHES } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

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

/** base-slot 处理完的骨架：身份对象 + Resources 两个 entry */
const shellPy = () => `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/Rumble/Rumble.bin"
}
entries: map[hash, embed] = {
    "Characters/Rumble/Skins/Skin3" = SkinCharacterDataProperties {
        skinClassification: u32 = 1
        championSkinName: string = "Rumble"
        objectPath: hash = 0x31d8c013
        skinParent: i32 = 0
        mEmblems: list[embed] = {
            EmblemData {
                emblem: string = "x"
            }
        }
    }
    "Characters/Rumble/Skins/Skin3" = ResourceResolver {
        resourceMap: map[hash, link] = {
            0x97e29b7d = 0x1
        }
    }
}`;

const propsTail = (text) => text.split('\n').filter((line) => /^\s*(ChromaData|skinParent):/.test(line));

step('没登记补丁的英雄返回 null', () => {
  assert.equal(findSkinPatch('ahri'), null);
  assert.equal(findSkinPatch('ahri', 3), null);
  assert.equal(findSkinPatch('RUMBLE').champion, 'rumble');
  return SKIN_PATCHES.map((patch) => patch.champion).join(',');
});

step('补丁可以按皮肤序号限定（只套验证过的那几个）', () => {
  assert.equal(findSkinPatch('rumble', 3).champion, 'rumble');
  assert.equal(findSkinPatch('rumble', 4), null, '4 号皮肤没验证过，不该套 Skin3 的粒子');
  assert.equal(findSkinPatch('rumble', 23), null);
});

step('补丁为 null 时文本原样返回', () => {
  const text = shellPy();
  const result = applySkinPatch(text, null);
  assert.equal(result.text, text);
  assert.deepEqual(result.added, []);
});

step('propsInsert 插在锚字段之后、缩进对齐 8 空格', () => {
  const result = applySkinPatch(shellPy(), {
    champion: 'x',
    propsInsert: [{ after: 'skinParent', label: 'L', text: 'thing: string = "y"' }],
  });
  const lines = result.text.split('\n');
  const at = lines.findIndex((line) => line === '        thing: string = "y"');
  assert.ok(at > 0, '插入的行应该在身份对象里、8 空格缩进');
  assert.equal(lines[at - 1].trim(), 'skinParent: i32 = 0');
  // 祖先块边界没被破坏：身份对象仍然是原来的收尾顺序
  assert.deepEqual(result.added, ['L']);
});

step('propsInsert 的多行块整体缩进（片段从 0 缩进写起也行）', () => {
  const result = applySkinPatch(shellPy(), {
    champion: 'x',
    propsInsert: [
      { after: 'skinParent', text: 'block: pointer = Foo {\n    a: i32 = 1\n}\nafter: i32 = 2' },
    ],
  });
  const lines = result.text.split('\n');
  const at = lines.findIndex((line) => line.trim() === 'block: pointer = Foo {');
  assert.equal(lines[at], '        block: pointer = Foo {');
  assert.equal(lines[at + 1], '            a: i32 = 1');
  assert.equal(lines[at + 2], '        }');
  assert.equal(lines[at + 3], '        after: i32 = 2');
});

step('propsInsert 锚字段不存在时跳过', () => {
  const text = shellPy().replace('skinParent: i32 = 0\n', '');
  const result = applySkinPatch(text, {
    champion: 'x',
    propsInsert: [{ after: 'skinParent', label: 'L', text: 'a: i32 = 1' }],
  });
  assert.equal(result.text, text);
  assert.deepEqual(result.added, []);
});

step('entriesInsert 插到 entries 表末尾、4 空格缩进', () => {
  const result = applySkinPatch(shellPy(), {
    champion: 'x',
    entriesInsert: [{ label: 'V', text: '0xabc = VfxSystemDefinitionData {\n    particleName: string = "p"\n}' }],
  });
  const lines = result.text.split('\n');
  const at = lines.findIndex((line) => line === '    0xabc = VfxSystemDefinitionData {');
  assert.ok(at > 0);
  assert.equal(lines[at + 1], '        particleName: string = "p"');
  assert.equal(lines[at + 2], '    }');
  assert.equal(lines[at + 3], '}');
});

step('重复套用不会插第二遍（幂等）', () => {
  const patch = {
    champion: 'x',
    propsInsert: [{ after: 'skinParent', text: 'a: i32 = 1' }],
    entriesInsert: [{ text: '0xabc = VfxSystemDefinitionData {\n    b: i32 = 2\n}' }],
    resourceMap: { set: { '0x97e29b7d': '0xe70b8192', '0x1234': '0x5678' } },
  };
  const once = applySkinPatch(shellPy(), patch);
  const twice = applySkinPatch(once.text, patch);
  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.added, []);
});

step('resourceMap.set 覆盖已有 key、追加新 key', () => {
  const result = applySkinPatch(shellPy(), {
    champion: 'x',
    resourceMap: { label: 'R', set: { '0x97e29b7d': '0xe70b8192', '0x1234': '0x5678' } },
  });
  assert.match(result.text, /^ {12}0x97e29b7d = 0xe70b8192$/m);
  assert.match(result.text, /^ {12}0x1234 = 0x5678$/m);
  assert.match(result.added[0], /2 条/);
  // 只改自己那几行，别的映射保持原样
  assert.match(result.text, /^ {12}0x97e29b7d = 0xe70b8192\n {12}0x1234 = 0x5678\n {8}\}$/m);
});

step('花括号不配平的片段直接抛错', () => {
  assert.throws(
    () => applySkinPatch(shellPy(), { champion: 'x', propsInsert: [{ after: 'skinParent', text: 'a: pointer = B {' }] }),
    /不配平/
  );
});

step('resourceMap.remove 删掉多余的 key（同一个粒子别挂两遍）', () => {
  const text = shellPy().replace(
    '            0x97e29b7d = 0x1',
    '            0x97e29b7d = 0x1\n            0xdead = 0x2'
  );
  const result = applySkinPatch(text, {
    champion: 'x',
    resourceMap: { set: {}, remove: ['0xdead'] },
  });
  assert.doesNotMatch(result.text, /0xdead/);
  assert.match(result.text, /0x97e29b7d = 0x1/);
  assert.match(result.added[0], /删 1 条/);
});

step('Rumble 补丁只剩「游戏数据里没有」的触发条件', () => {
  const patch = findSkinPatch('rumble');
  assert.ok(patch, 'rumble 补丁应该注册了');
  assert.equal(patch.propsInsert.length, 1);
  assert.equal(patch.entriesInsert, undefined, '粒子定义在皮肤自己的 bin 里，不该抄进来');
  assert.equal(Object.keys(patch.resourceMap.set).length, 3);
  assert.deepEqual(patch.resourceMap.remove, ['0x52c319c0', '0x55c31e79']);
  assert.equal(patch.resourceMap.set['0x74ad149b'], '0xa075fcc1', 'R 的燃烧引用要指到系统本体');
  const conditions = patch.propsInsert[0].text;
  assert.match(conditions, /ChromaData: pointer = 0xe7ee4f28/);
  assert.match(conditions, /PersistentEffectConditions: list2\[pointer\] = \{/);
  assert.match(conditions, /mScriptName: string = "RumbleFlameThrower"/);
  assert.match(conditions, /boneName: string = "R_Flame"/);
  assert.match(conditions, /effectKey: hash = 0x97e29b7d/);
  assert.doesNotMatch(conditions, /VfxSystemDefinitionData/, '补丁里不该再有粒子定义副本');
  return `${conditions.split('\n').length} 行条件`;
});

step('Rumble 补丁套到 shell 上后结构正确', () => {
  const result = applySkinPatch(shellPy(), findSkinPatch('rumble'));
  assert.equal(result.added.length, 2);
  const lines = result.text.split('\n');
  const chroma = lines.findIndex((line) => line.trim().startsWith('ChromaData: pointer'));
  const parent = lines.findIndex((line) => line.trim() === 'skinParent: i32 = 0');
  assert.equal(chroma, parent + 1);
  // 没有再往 entries 表里加条目
  assert.equal(lines[lines.length - 1], '}');
  assert.equal(lines.filter((line) => /^ {4}(0x|\S+= )/.test(line)).length,
    shellPy().split('\n').filter((line) => /^ {4}(0x|\S+= )/.test(line)).length);
  // 身份对象里的 mEmblems 没被动过
  assert.match(result.text, /mEmblems: list\[embed\] = \{/);
});

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
if (failures > 0) process.exit(1);
