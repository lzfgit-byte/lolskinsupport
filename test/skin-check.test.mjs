/**
 * LTK skinhack 名字检查的单元测试（不需要游戏和 ctools）。
 *
 * 规则来自 LTK 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`：
 * `ChampionSkinName` / `TagEventList` / `BankUnits[].Name` / 非 voiceOver 单位的事件名
 * 里出现 `<英雄>skin<n>`（n≠0）就整包被拒；base 皮肤自己也列的事件不算（stock）。
 *
 * 运行：npm run skincheck:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinCheck.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 electron/export/skin-check.ts`);
}
const {
  namesOtherSkin,
  checkSkinNames,
  describeSkinCheck,
  skinCheckPath,
  writeSkinCheck,
  readSkinCheck,
  blockedSkinCheck,
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

const bin = ({ skinName = 'Akali', tags = ['Akali'], units }) => `#PROP_text
type: string = "PROP"
version: u32 = 3
entries: map[hash, embed] = {
    0x7c5cc18f = SkinCharacterDataProperties {
        championSkinName: string = "${skinName}"
        skinAudioProperties: embed = SkinAudioProperties {
            tagEventList: list[string] = { ${tags.map((tag) => `"${tag}"`).join(', ')} }
            bankUnits: list2[embed] = {
${units
  .map(
    (unit) => `                BankUnit {
                    name: string = "${unit.name}"
                    bankPath: list[string] = {
                        "assets/sounds/wwise2016/sfx/characters/akali/${unit.name.toLowerCase()}_events.bnk"
                    }
                    events: list[string] = { ${unit.events.map((event) => `"${event}"`).join(', ')} }
${unit.voiceOver ? '                    voiceOver: bool = true\n' : ''}                }`
  )
  .join('\n')}
            }
        }
    }
}
`;

const baseBin = bin({
  tags: ['Akali'],
  units: [
    {
      name: 'Akali_Base_SFX',
      events: ['Play_sfx_Akali_AkaliP_Activate', 'Play_sfx_Akali_AkaliSkin102_Recall_cast'],
    },
  ],
});

const baseAudio = (text) => {
  const matched = /tagEventList: list\[string\] = \{([\s\S]*?)\n\s*bankUnits: list2\[embed\] = \{([\s\S]*?)\n {12}\}/.exec(
    text
  );
  return {
    tagEventList: `tagEventList: list[string] = {${matched[1]}}`,
    bankUnits: `bankUnits: list2[embed] = {${matched[2]}\n            }`,
  };
};

await step('namesOtherSkin 与 LTK 的子串规则一致', () => {
  assert.equal(namesOtherSkin('AatroxSkin07', 'aatroxskin'), true);
  assert.equal(namesOtherSkin('AatroxSkin0', 'aatroxskin'), false);
  assert.equal(namesOtherSkin('Play_sfx_Akali_AkaliP_Activate', 'akaliskin'), false);
  assert.equal(namesOtherSkin('Play_sfx_sona_skin77_X', 'sonaskin'), false, '带下划线不算');
  assert.equal(namesOtherSkin('Play_mus_SonaSkin77_X', 'sonaskin'), true);
  assert.equal(namesOtherSkin('Akali_Skin102_SFX', 'akali_skin', '_sfx'), true);
  assert.equal(namesOtherSkin('Akali_Base_SFX', 'akali_skin', '_sfx'), false);
  return '7 个例子';
});

await step('干净的 bin：通过', () => {
  const text = bin({
    units: [{ name: 'Akali_Base_SFX', events: ['Play_sfx_Akali_AkaliP_Activate'] }],
  });
  assert.deepEqual(checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } }), []);
  return '0 处';
});

await step('状态类事件（tag 在第二段）也能抓到', () => {
  const text = bin({
    units: [
      {
        name: 'Akali_Base_SFX',
        events: ['Play_AkaliSkin102_Attack1_To_Idle', 'Play_sfx_Akali_AkaliP_Activate'],
      },
    ],
  });
  const problems = checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } });
  assert.deepEqual(problems, [{ kind: 'event', value: 'Play_AkaliSkin102_Attack1_To_Idle' }]);
  return '1 处';
});

await step('championSkinName / tagEventList / 单位名', () => {
  const text = bin({
    skinName: 'AkaliSkin102',
    tags: ['Akali', 'AkaliSkin102'],
    units: [{ name: 'Akali_Skin102_SFX', events: ['Play_sfx_Akali_AkaliP_Activate'] }],
  });
  const problems = checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } });
  assert.deepEqual(
    problems.map((item) => `${item.kind}:${item.value}`).sort(),
    ['championSkinName:AkaliSkin102', 'tagEventList:AkaliSkin102', 'unitName:Akali_Skin102_SFX'],
    '单位名命中后不再看它的 events'
  );
  return '3 处';
});

await step('base 皮肤自己也列的事件（stock）不算', () => {
  const text = bin({
    units: [
      {
        name: 'Akali_Base_SFX',
        events: ['Play_sfx_Akali_AkaliSkin102_Recall_cast'],
      },
    ],
  });
  assert.deepEqual(checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } }), []);
  return 'stock 命中';
});

await step('voiceOver 单位的事件不查', () => {
  const text = bin({
    units: [
      {
        name: 'Akali_Base_VO',
        events: ['Play_vo_AkaliSkin102_Death3D'],
        voiceOver: true,
      },
    ],
  });
  assert.deepEqual(checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } }), []);
  return '跳过';
});

await step('别的英雄的名字不算', () => {
  const text = bin({
    units: [{ name: 'Akali_Base_SFX', events: ['Play_sfx_Akali_EvelynnSkin65_FirstEncounter'] }],
  });
  assert.deepEqual(checkSkinNames({ text, champion: 'akali', base: { audio: baseAudio(baseBin) } }), []);
  return '只认本英雄';
});

await step('检查结果写到 zip 旁边，读回来一致', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-check-'));
  const zip = path.join(dir, '84', '84_102.zip');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.writeFileSync(zip, 'not a real zip');
  const result = {
    ok: false,
    champion: 'akali',
    checkedAt: '2026-11-19T00:00:00.000Z',
    problems: [
      { kind: 'event', value: 'Play_AkaliSkin102_Attack1_To_Idle' },
      { kind: 'event', value: 'Switch_AkaliSkin102_Footsteps_Brush' },
    ],
  };
  writeSkinCheck(zip, result);
  assert.equal(skinCheckPath(zip), `${zip}.check.json`);
  assert.deepEqual(readSkinCheck(zip), result);
  assert.equal(describeSkinCheck(result), 'Play_AkaliSkin102_Attack1_To_Idle、Switch_AkaliSkin102_Footsteps_Brush');
  assert.equal(readSkinCheck(path.join(dir, 'nothing.zip')), null, '没有文件就是 null');
  assert.ok(blockedSkinCheck(zip), '检查没过：注入前要拦住');
  assert.equal(blockedSkinCheck(path.join(dir, 'nothing.zip')), null, '没检查过的老包放行');
  writeSkinCheck(zip, { ...result, ok: true, problems: [] });
  assert.equal(blockedSkinCheck(zip), null, '通过的包放行');
  fs.rmSync(dir, { recursive: true, force: true });
  return 'roundtrip 正常';
});

console.log(failures === 0 ? '\nLTK 名字检查测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
