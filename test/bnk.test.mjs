/**
 * Wwise bank 读写的单元测试（不需要游戏）。
 *
 * 覆盖：BKHD/HIRC 解析与写回、Event 的 action 列表、增删改 Event、Wwise 名称哈希。
 * 期望的哈希值来自 Rose 的 `bnk.py`（同一批名字）。
 *
 * 运行：npm run bnk:test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'bnk.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run bnk:test 的构建步骤`);
}

const { Bank, BankError, wwiseHash, HIRC_EVENT, HIRC_ACTION } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

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

/** Wwise 的变长整数（新版 bank 用它存 Event 的 action 数量） */
const varUint = (input) => {
  const groups = [input & 0x7f];
  let value = Math.floor(input / 128);
  while (value > 0) {
    groups.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return Buffer.from(groups.reverse());
};

const u32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

/** 造一个 bank：BKHD + HIRC（Event/Action 对象） */
const makeBank = (version, events, actions = []) => {
  const encodeActions = (actionIds) =>
    Buffer.concat([
      version <= 122 ? u32(actionIds.length) : varUint(actionIds.length),
      ...actionIds.map((id) => u32(id)),
    ]);
  const hirc = [];
  for (const actionId of actions) {
    hirc.push({ kind: HIRC_ACTION, id: actionId, body: Buffer.alloc(8) });
  }
  for (const [name, actionIds] of Object.entries(events)) {
    hirc.push({ kind: HIRC_EVENT, id: wwiseHash(name), body: encodeActions(actionIds) });
  }

  const header = Buffer.alloc(4 + 12);
  header.writeUInt32LE(version, 0);
  const bkhd = Buffer.concat([Buffer.from('BKHD', 'latin1'), u32(header.length), header]);

  const objects = Buffer.concat(
    hirc.map((object) => {
      const head = Buffer.alloc(9);
      head.writeUInt8(object.kind, 0);
      head.writeUInt32LE(4 + object.body.length, 1);
      head.writeUInt32LE(object.id, 5);
      return Buffer.concat([head, object.body]);
    })
  );
  const hircBody = Buffer.concat([u32(hirc.length), objects]);
  const hircChunk = Buffer.concat([Buffer.from('HIRC', 'latin1'), u32(hircBody.length), hircBody]);
  return Buffer.concat([bkhd, hircChunk]);
};

step('Wwise 名称哈希与 Rose 的 bnk.py 一致', () => {
  const expected = {
    'Play_sfx_Vayne_VayneTumble_OnCast': 2639627287,
    'Play_sfx_VayneSkin11_VayneTumble_OnCast': 3209551168,
    'Vayne_Base_SFX': 1484175528,
    'Vayne_Skin11_SFX': 4265641870,
    'Play_vo_Vayne_Death3D': 928608391,
    SFX: 393239870,
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(wwiseHash(name), value, name);
  }
  assert.equal(wwiseHash(''), 2166136261);
  assert.equal(wwiseHash('Vayne_Base_SFX'), wwiseHash('vayne_base_sfx'), '大小写不敏感');
  return `${Object.keys(expected).length} 个名字`;
});

step('解析出 Event 和它的 action 列表', () => {
  const data = makeBank(145, { 'Play_sfx_A': [11, 12], 'Play_sfx_B': [13] }, [11, 12, 13]);
  const bank = Bank.parse(data);
  assert.equal(bank.version, 145);
  assert.equal(bank.eventIds().length, 2);
  assert.deepEqual(bank.eventActions(wwiseHash('Play_sfx_A')), [11, 12]);
  assert.deepEqual(bank.eventActions(wwiseHash('Play_sfx_B')), [13]);
  assert.equal(bank.hasEvent(wwiseHash('Play_sfx_C')), false);
  return '2 个事件';
});

step('没改过就逐字节写回', () => {
  const data = makeBank(145, { 'Play_sfx_A': [11] }, [11]);
  const bank = Bank.parse(data);
  assert.ok(bank.write().equals(data));
  return `${data.length} 字节`;
});

step('加一个别名 Event：指向同一批 Action', () => {
  const data = makeBank(145, { 'Play_sfx_A': [11, 12] }, [11, 12]);
  const bank = Bank.parse(data);
  const aliasId = wwiseHash('Play_sfx_B');
  bank.addEvent(aliasId, bank.eventActions(wwiseHash('Play_sfx_A')));
  const again = Bank.parse(bank.write());
  assert.deepEqual(again.eventActions(aliasId), [11, 12]);
  assert.equal(again.eventIds().length, 2);
  return '别名指向同一 Action';
});

step('改 Event 的 Action 与删 Event', () => {
  const data = makeBank(145, { 'Play_sfx_A': [11] }, [11, 12]);
  const bank = Bank.parse(data);
  const id = wwiseHash('Play_sfx_A');
  assert.equal(bank.setEventActions(id, [12]), 1);
  assert.deepEqual(Bank.parse(bank.write()).eventActions(id), [12]);
  assert.equal(bank.removeEvent(id), 1);
  const again = Bank.parse(bank.write());
  assert.equal(again.hasEvent(id), false);
  assert.equal(again.eventIds().length, 0, 'Action 对象要留着');
  return '改 + 删';
});

step('老版本 bank（u32 action 数量）也能读', () => {
  const data = makeBank(112, { 'Play_sfx_Old': [7] }, [7]);
  const bank = Bank.parse(data);
  assert.deepEqual(bank.eventActions(wwiseHash('Play_sfx_Old')), [7]);
  return 'version 112';
});

step('不是 bank 的数据要报错', () => {
  for (const bad of [Buffer.alloc(0), Buffer.from('MESH'), Buffer.from('BKHD\0\0\0\0')]) {
    assert.throws(() => Bank.parse(bad), BankError);
  }
  return 'BankError';
});

console.log(failures === 0 ? '\nWwise bank 读写测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
