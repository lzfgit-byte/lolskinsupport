/**
 * 音效别名规划的单元测试（不需要游戏和 cslol-tools）。
 *
 * 覆盖：bank 单位改名、事件换成 base tag 的别名、别名 Event 写进皮肤的事件 bank、
 * base 皮肤事件 bank 里同 id 的 Event 让位、语音单位换成 base 的、辅助函数
 * （Skin<n> 段判断、事件名里的 tag、本地化路径）。
 *
 * 运行：npm run banks:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinBanks.mjs');
const AUDIO = path.join(ROOT, 'test', '.tmp', 'skinAudio.mjs');
const BNK = path.join(ROOT, 'test', '.tmp', 'bnk.mjs');
for (const file of [BUNDLE, AUDIO, BNK]) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${file}，先运行 npm run banks:test 的构建步骤`);
  }
}

const {
  planBankAliases,
  collectBankPaths,
  baseUnitName,
  hasSkinTag,
  tagStart,
  isLocalizedPath,
  renameTag,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);
const { readAudioBlocks, parseBankUnits } = await import(`file:///${AUDIO.replace(/\\/g, '/')}`);
const { Bank, wwiseHash, HIRC_EVENT, HIRC_ACTION } = await import(`file:///${BNK.replace(/\\/g, '/')}`);

let failures = 0;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

const u32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

const varUint = (input) => {
  const groups = [input & 0x7f];
  let value = Math.floor(input / 128);
  while (value > 0) {
    groups.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return Buffer.from(groups.reverse());
};

/** 造一个 bank：BKHD + HIRC */
const makeBank = (version, events) => {
  const objects = Object.entries(events).map(([name, actions]) => {
    const body = Buffer.concat([
      version <= 122 ? u32(actions.length) : varUint(actions.length),
      ...actions.map((id) => u32(id)),
    ]);
    const head = Buffer.alloc(9);
    head.writeUInt8(HIRC_EVENT, 0);
    head.writeUInt32LE(4 + body.length, 1);
    head.writeUInt32LE(wwiseHash(name), 5);
    return Buffer.concat([head, body]);
  });
  // 一个 Action 对象，确保删 Event 时它还在
  const actionHead = Buffer.alloc(9);
  actionHead.writeUInt8(HIRC_ACTION, 0);
  actionHead.writeUInt32LE(4 + 8, 1);
  actionHead.writeUInt32LE(1, 5);
  objects.push(Buffer.concat([actionHead, Buffer.alloc(8)]));

  const body = Buffer.concat([u32(objects.length), ...objects]);
  const header = Buffer.alloc(16);
  header.writeUInt32LE(version, 0);
  return Buffer.concat([
    Buffer.from('BKHD', 'latin1'),
    u32(header.length),
    header,
    Buffer.from('HIRC', 'latin1'),
    u32(body.length),
    body,
  ]);
};

const SKIN_BANK = 'ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Skin11/Vayne_Skin11_SFX_events.bnk';
const SKIN_AUDIO = 'ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Skin11/Vayne_Skin11_SFX_audio.bnk';
const BASE_BANK = 'ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Base/Vayne_Base_SFX_events.bnk';

const SKIN_PY = `entries: map[hash,embed] = {
    "Characters/Vayne/Skins/Skin0" = SkinCharacterDataProperties {
        skinAudioProperties: embed = skinAudioProperties {
            tagEventList: list[string] = {
                "Vayne"
                "VayneSkin11"
            }
            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Vayne_Skin11_SFX"
                    bankPath: list[string] = {
                        "${SKIN_AUDIO}"
                        "${SKIN_BANK}"
                    }
                    events: list[string] = {
                        "Play_sfx_VayneSkin11_A"
                        "Play_sfx_VayneSkin11_B"
                    }
                }
                BankUnit {
                    name: string = "Vayne_Skin11_VO"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/Skins/Skin11/Vayne_Skin11_VO_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_vo_VayneSkin11_Death3D"
                    }
                    voiceOver: bool = true
                }
            }
        }
    }
}
`;

const BASE_PY = `entries: map[hash,embed] = {
    "Characters/Vayne/Skins/Skin0" = SkinCharacterDataProperties {
        skinAudioProperties: embed = skinAudioProperties {
            tagEventList: list[string] = {
                "Vayne"
            }
            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Vayne_Base_SFX"
                    bankPath: list[string] = {
                        "${BASE_BANK}"
                    }
                    events: list[string] = {
                        "Play_sfx_Vayne_A"
                    }
                }
                BankUnit {
                    name: string = "Vayne_Base_VO"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/Skins/Base/Vayne_Base_VO_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_vo_Vayne_Death3D"
                    }
                    voiceOver: bool = true
                }
            }
        }
    }
}
`;

const baseAudio = () => readAudioBlocks(BASE_PY);
const banks = () => ({
  [SKIN_BANK.toLowerCase()]: makeBank(145, {
    Play_sfx_VayneSkin11_A: [11],
    Play_sfx_VayneSkin11_B: [12],
  }),
  [BASE_BANK.toLowerCase()]: makeBank(145, { Play_sfx_Vayne_A: [99] }),
});

step('Skin<n> 段与 base 单位名', () => {
  assert.equal(baseUnitName('Vayne_Skin11_SFX'), 'Vayne_Base_SFX');
  assert.equal(baseUnitName('Aatrox_Skin01_SFX'), 'Aatrox_Base_SFX');
  assert.equal(baseUnitName('Vayne_Base_SFX'), null);
  assert.equal(baseUnitName('Lillia_Skin02_VO'), 'Lillia_Base_VO');
  return '3 个例子';
});

step('事件名里的 Skin<n> 判断', () => {
  assert.equal(hasSkinTag('Play_sfx_VayneSkin11_A'), true);
  assert.equal(hasSkinTag('Play_sfx_Skin12_A'), true);
  assert.equal(hasSkinTag('Play_sfx_Vayne_A'), false);
  assert.equal(tagStart('Play_sfx_VayneSkin11_A'), 9);
  assert.equal(tagStart('NoUnderscore'), null);
  return 'ok';
});

step('tag 改名与本地化路径', () => {
  assert.equal(
    renameTag('Play_sfx_VayneSkin11_A', 'VayneSkin11', 'Vayne'),
    'Play_sfx_Vayne_A'
  );
  assert.equal(renameTag('Play_sfx_VayneSkin11_A', 'AatroxSkin11', 'Aatrox'), null);
  assert.equal(
    isLocalizedPath('ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/x.bnk'),
    true
  );
  assert.equal(isLocalizedPath(SKIN_BANK), false);
  return 'ok';
});

step('要读的 bank：皮肤 + base 的事件 bank，语音不读', () => {
  const paths = collectBankPaths(SKIN_PY, baseAudio());
  assert.deepEqual(paths.sort(), [BASE_BANK, SKIN_BANK].sort());
  return paths.length + ' 个';
});

await step('补别名：事件换成 base 名字，别名写进皮肤 bank', async () => {
  const data = banks();
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan, '应该能规划');
  assert.deepEqual(plan.renamedUnits, [
    { from: 'Vayne_Skin11_SFX', to: 'Vayne_Base_SFX' },
  ]);
  assert.equal(plan.aliasedEvents, 2);
  assert.equal(plan.missingEvents, 0);
  assert.deepEqual(plan.voiceUnits, ['Vayne_Skin11_VO']);
  assert.deepEqual(plan.patchedBaseBanks, [BASE_BANK]);
  assert.equal(plan.files.length, 2);

  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.equal(units.length, 2);
  assert.equal(units[0].name, 'Vayne_Base_SFX');
  assert.equal(units[0].voiceOver, false);
  assert.deepEqual(units[0].events, ['Play_sfx_Vayne_A', 'Play_sfx_Vayne_B']);
  assert.equal(units[1].name, 'Vayne_Base_VO', '语音换成 base 的单位');
  assert.deepEqual(units[1].events, ['Play_vo_Vayne_Death3D']);
  assert.equal(plan.blocks.bankUnits.includes('VayneSkin11'), false, '不该再出现别的皮肤名字');

  const skinFile = plan.files.find((file) => file.path.includes('skin11'));
  const skinBank = Bank.parse(skinFile.data);
  const aliasId = wwiseHash('Play_sfx_Vayne_A');
  assert.equal(skinBank.hasEvent(aliasId), true, '别名要写进皮肤的事件 bank');
  assert.deepEqual(skinBank.eventActions(aliasId), [11], '别名指向皮肤的 Action');
  assert.equal(skinBank.eventActions(wwiseHash('Play_sfx_Vayne_B'))?.length, 1);

  const baseFile = plan.files.find((file) => file.path.includes('skins/base'));
  assert.equal(Bank.parse(baseFile.data).hasEvent(aliasId), false, 'base bank 里的同 id 要让位');
  return `${plan.aliasedEvents} 个别名，${plan.files.length} 个 bank`;
});

await step('bank 里找不到事件：不补别名，列出来会被删掉', async () => {
  const data = banks();
  data[SKIN_BANK.toLowerCase()] = makeBank(145, { Play_sfx_VayneSkin11_A: [11] });
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan);
  assert.equal(plan.aliasedEvents, 1);
  assert.equal(plan.missingEvents, 1);
  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.deepEqual(units[0].events, ['Play_sfx_Vayne_A']);
  return '1 个缺失';
});

await step('没有 base 语音单位：退回整段替换', async () => {
  const base = baseAudio();
  const withoutVo = {
    tagEventList: base.tagEventList,
    bankUnits: base.bankUnits.replace(/BankUnit \{[\s\S]*?voiceOver: bool = true[\s\S]*?\n {16}\}/, ''),
  };
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: withoutVo,
    readBank: async () => null,
  });
  assert.equal(plan, null);
  return 'null';
});

await step('没有要合并的 tag：退回整段替换', async () => {
  const py = SKIN_PY.replace('"VayneSkin11"', '"Vayne"');
  const plan = await planBankAliases({
    pyText: py,
    character: 'vayne',
    baseAudio: baseAudio(),
    readBank: async () => null,
  });
  assert.equal(plan, null);
  return 'null';
});

await step('读不到 bank 也算不出别名：单位只改名，事件保留', async () => {
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    readBank: async () => null,
  });
  assert.ok(plan);
  assert.equal(plan.aliasedEvents, 0);
  assert.equal(plan.missingEvents, 0);
  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.equal(units[0].name, 'Vayne_Base_SFX');
  assert.equal(plan.files.length, 0);
  return '不改事件';
});

console.log(failures === 0 ? '\n音效别名测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
