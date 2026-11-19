/**
 * 音效/语音别名规划的单元测试（不需要游戏和 cslol-tools）。
 *
 * 覆盖：bank 单位改名、事件换成 base tag 的别名、别名 Event 写进皮肤的事件 bank、
 * base 皮肤事件 bank 里同 id 的 Event 让位、语音别名写进语言无关的 sidecar bank、
 * 辅助函数（Skin<n> 段判断、事件名里的 tag、本地化路径、sidecar 路径）。
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
  createSidecarRegistry,
  flushSidecars,
  collectBankPaths,
  collectVoiceBankPaths,
  sidecarPath,
  baseUnitName,
  hasSkinTag,
  tagStart,
  isLocalizedPath,
  renameTag,
  otherSkinSegment,
  renameSegment,
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

/** 造一个 bank：BKHD + HIRC（Event + 空 body 的 Action） */
const makeBank = (version, events, actionIds = []) => {
  const objects = [];
  for (const actionId of actionIds) {
    const head = Buffer.alloc(9);
    head.writeUInt8(HIRC_ACTION, 0);
    head.writeUInt32LE(12, 1);
    head.writeUInt32LE(actionId, 5);
    objects.push(Buffer.concat([head, Buffer.alloc(8)]));
  }
  for (const [name, actions] of Object.entries(events)) {
    const body = Buffer.concat([
      version <= 122 ? u32(actions.length) : varUint(actions.length),
      ...actions.map((id) => u32(id)),
    ]);
    const head = Buffer.alloc(9);
    head.writeUInt8(HIRC_EVENT, 0);
    head.writeUInt32LE(4 + body.length, 1);
    head.writeUInt32LE(wwiseHash(name), 5);
    objects.push(Buffer.concat([head, body]));
  }

  const body = Buffer.concat([u32(objects.length), ...objects]);
  const header = Buffer.alloc(16);
  header.writeUInt32LE(version, 0);
  header.writeUInt32LE(1234, 4); // bank id
  header.writeUInt32LE(0, 8); // language id
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
const SKIN_VO = 'ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/Skins/Skin11/Vayne_Skin11_VO_events.bnk';
const SKIN_VO_AUDIO =
  'ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/Skins/Skin11/Vayne_Skin11_VO_audio.bnk';
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
                        "${SKIN_VO_AUDIO}"
                        "${SKIN_VO}"
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
  [SKIN_VO.toLowerCase()]: makeBank(145, { Play_vo_VayneSkin11_Death3D: [77] }, [77]),
  [BASE_BANK.toLowerCase()]: makeBank(145, { Play_sfx_Vayne_A: [99] }),
});

await step('Skin<n> 段与 base 单位名', () => {
  assert.equal(baseUnitName('Vayne_Skin11_SFX'), 'Vayne_Base_SFX');
  assert.equal(baseUnitName('Aatrox_Skin01_SFX'), 'Aatrox_Base_SFX');
  assert.equal(baseUnitName('Vayne_Base_SFX'), null);
  assert.equal(baseUnitName('Lillia_Skin02_VO'), 'Lillia_Base_VO');
  return '3 个例子';
});

await step('事件名里的 Skin<n> 判断', () => {
  assert.equal(hasSkinTag('Play_sfx_VayneSkin11_A'), true);
  assert.equal(hasSkinTag('Play_sfx_Skin12_A'), true);
  assert.equal(hasSkinTag('Play_sfx_Vayne_A'), false);
  assert.equal(tagStart('Play_sfx_VayneSkin11_A'), 9);
  assert.equal(tagStart('NoUnderscore'), null);
  return 'ok';
});

await step('tag 改名与本地化路径', () => {
  assert.equal(
    renameTag('Play_sfx_VayneSkin11_A', 'VayneSkin11', 'Vayne'),
    'Play_sfx_Vayne_A'
  );
  assert.equal(renameTag('Play_sfx_VayneSkin11_A', 'AatroxSkin11', 'Aatrox'), null);
  assert.equal(isLocalizedPath(SKIN_VO), true);
  assert.equal(isLocalizedPath(SKIN_BANK), false);
  return 'ok';
});

await step('语音 sidecar 路径去掉语言目录', () => {
  assert.equal(
    sidecarPath(SKIN_VO),
    'ASSETS/Sounds/Wwise2016/VO/Characters/Vayne/Skins/Skin11/Vayne_Skin11_VO_basetag_events.bnk'
  );
  return 'VO_basetag_events.bnk';
});

await step('要读的 bank：主 WAD 的 + 语言 WAD 的', () => {
  assert.deepEqual(collectBankPaths(SKIN_PY, baseAudio()).sort(), [BASE_BANK, SKIN_BANK].sort());
  assert.deepEqual(collectVoiceBankPaths(SKIN_PY), [SKIN_VO]);
  return '2 + 1';
});

await step('补别名：音效进皮肤 bank，语音进 sidecar', async () => {
  const data = banks();
  const registry = createSidecarRegistry();
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: registry,
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan, '应该能规划');
  assert.deepEqual(plan.renamedUnits, [
    { from: 'Vayne_Skin11_SFX', to: 'Vayne_Base_SFX' },
    { from: 'Vayne_Skin11_VO', to: 'Vayne_Base_VO' },
  ]);
  assert.equal(plan.aliasedEvents, 2);
  assert.equal(plan.voiceAliases, 1);
  assert.equal(plan.missingEvents, 0);
  assert.deepEqual(plan.voiceUnits, ['Vayne_Skin11_VO']);
  assert.deepEqual(plan.patchedBaseBanks, [BASE_BANK]);
  assert.equal(plan.files.length, 2, '皮肤事件 bank + base 事件 bank');
  const sidecarFiles = flushSidecars(registry);
  assert.equal(sidecarFiles.length, 1, '语音 sidecar 由 flush 产出');

  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.equal(units.length, 2);
  assert.equal(units[0].name, 'Vayne_Base_SFX');
  assert.deepEqual(units[0].events, ['Play_sfx_Vayne_A', 'Play_sfx_Vayne_B']);
  assert.equal(units[1].name, 'Vayne_Base_VO');
  assert.deepEqual(units[1].events, ['Play_vo_Vayne_Death3D']);
  assert.deepEqual(units[1].paths, [SKIN_VO_AUDIO, SKIN_VO, sidecarPath(SKIN_VO)]);
  assert.equal(plan.blocks.bankUnits.includes('VayneSkin11'), false, '不该再出现别的皮肤名字');

  const skinFile = plan.files.find((file) => file.path.endsWith('vayne_skin11_sfx_events.bnk'));
  const skinBank = Bank.parse(skinFile.data);
  const aliasId = wwiseHash('Play_sfx_Vayne_A');
  assert.equal(skinBank.hasEvent(aliasId), true, '音效别名要写进皮肤的事件 bank');
  assert.deepEqual(skinBank.eventActions(aliasId), [11], '别名指向皮肤的 Action');

  const baseFile = plan.files.find((file) => file.path.includes('skins/base'));
  assert.equal(Bank.parse(baseFile.data).hasEvent(aliasId), false, 'base bank 里的同 id 要让位');

  const sidecarFile = sidecarFiles[0];
  assert.equal(sidecarFile.path, sidecarPath(SKIN_VO).toLowerCase());
  const sidecar = Bank.parse(sidecarFile.data);
  const voAlias = wwiseHash('Play_vo_Vayne_Death3D');
  assert.equal(sidecar.hasEvent(voAlias), true);
  assert.deepEqual(sidecar.eventActions(voAlias), [77], 'sidecar 的 Action 沿用源 bank 的 id');
  // 头部：bank id 换成 sidecar 的文件名，language id 换成 SFX
  assert.equal(sidecarFile.data.readUInt32LE(12), wwiseHash('Vayne_Skin11_VO_basetag_events'));
  assert.equal(sidecarFile.data.readUInt32LE(16), wwiseHash('SFX'));
  return `${plan.aliasedEvents} 音效 + ${plan.voiceAliases} 语音，${plan.files.length + sidecarFiles.length} 个 bank`;
});

await step('状态类事件（Play_<tag>_<状态>）也要换成 base 名字', async () => {
  // Akali skin102 的 `Play_AkaliSkin102_Attack1_To_Idle` 的 tag 在第二段，
  // 只按第三段取 tag 会漏掉，名字留在包里就被 LTK 判 skinhack
  assert.equal(otherSkinSegment('Play_AkaliSkin102_Attack1_To_Idle', 'akali'), 'AkaliSkin102');
  assert.equal(otherSkinSegment('Play_sfx_AkaliSkin102_Idle1', 'akali'), 'AkaliSkin102');
  assert.equal(otherSkinSegment('Play_sfx_Akali_AkaliP_Activate', 'akali'), null);
  assert.equal(otherSkinSegment('Play_AkaliSkin0_Idle', 'akali'), null, 'Skin0 是 base，不算');
  assert.equal(otherSkinSegment('Play_sfx_Jade_VayneSkin11_A', 'jade_vayne'), 'VayneSkin11');
  assert.equal(renameSegment('Play_AkaliSkin102_Attack1_To_Idle', 'AkaliSkin102', 'Akali'), 'Play_Akali_Attack1_To_Idle');

  const py = SKIN_PY.replace(
    '"Play_sfx_VayneSkin11_B"',
    '"Play_VayneSkin11_Attack1_To_Idle"'
  );
  const data = banks();
  data[SKIN_BANK.toLowerCase()] = makeBank(145, {
    Play_sfx_VayneSkin11_A: [11],
    Play_VayneSkin11_Attack1_To_Idle: [13],
  });
  const registry = createSidecarRegistry();
  const plan = await planBankAliases({
    pyText: py,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: registry,
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan);
  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.deepEqual(units[0].events, ['Play_sfx_Vayne_A', 'Play_Vayne_Attack1_To_Idle']);
  assert.equal(plan.blocks.bankUnits.includes('VayneSkin11'), false, '不该再出现别的皮肤名字');
  assert.equal(plan.aliasedEvents, 2);
  const skinFile = plan.files.find((file) => file.path.endsWith('vayne_skin11_sfx_events.bnk'));
  const skinBank = Bank.parse(skinFile.data);
  assert.deepEqual(
    skinBank.eventActions(wwiseHash('Play_Vayne_Attack1_To_Idle')),
    [13],
    '状态事件的别名指向原 Action'
  );
  return '2 个别名';
});

await step('两个角色共用一个 sidecar：别名累计', async () => {
  const data = banks();
  const registry = createSidecarRegistry();
  const first = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: registry,
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  const second = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: registry,
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(first && second);
  assert.equal(first.voiceAliases, 1);
  assert.equal(second.voiceAliases, 0, '同一个别名不会再加一遍');
  const sidecarFiles = flushSidecars(registry);
  assert.equal(sidecarFiles.length, 1, '还是只有一个 sidecar');
  assert.equal(sidecarFiles[0].aliases, 1);
  return '累计 1 个';
});

await step('语音 bank 读不到：整份退回 base 语音', async () => {
  const data = banks();
  delete data[SKIN_VO.toLowerCase()];
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: createSidecarRegistry(),
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.equal(plan, null);
  return 'null';
});

await step('bank 里找不到事件：不补别名，列出来会被删掉', async () => {
  const data = banks();
  data[SKIN_BANK.toLowerCase()] = makeBank(145, { Play_sfx_VayneSkin11_A: [11] });
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: createSidecarRegistry(),
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan);
  assert.equal(plan.aliasedEvents, 1);
  assert.equal(plan.missingEvents, 1);
  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.deepEqual(units[0].events, ['Play_sfx_Vayne_A']);
  return '1 个缺失';
});

await step('没有要合并的 tag：退回整段替换', async () => {
  const py = SKIN_PY.replace('"VayneSkin11"', '"Vayne"');
  const plan = await planBankAliases({
    pyText: py,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: createSidecarRegistry(),
    readBank: async () => null,
  });
  assert.equal(plan, null);
  return 'null';
});

await step('主 bank 读不到但语音在：音效不补，语音照补', async () => {
  const data = banks();
  delete data[SKIN_BANK.toLowerCase()];
  const plan = await planBankAliases({
    pyText: SKIN_PY,
    character: 'vayne',
    baseAudio: baseAudio(),
    sidecars: createSidecarRegistry(),
    readBank: async (bankPath) => data[bankPath.toLowerCase()] ?? null,
  });
  assert.ok(plan);
  assert.equal(plan.aliasedEvents, 0);
  assert.equal(plan.voiceAliases, 1);
  const units = parseBankUnits(plan.blocks.bankUnits);
  assert.equal(units[0].name, 'Vayne_Base_SFX');
  assert.deepEqual(units[0].events, [], '事件 bank 读不到，皮肤事件不列出');
  return '语音 1 个';
});

console.log(failures === 0 ? '\n音效/语音别名测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
