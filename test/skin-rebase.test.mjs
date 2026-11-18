/**
 * base-skin 改写的单元测试（不需要游戏和 cslol-tools）。
 *
 * 覆盖：身份字段改写、SKN/SKL 重建到 base 路径（不再是末尾补 0）、削掉老 Rose
 * 的 16 字节填充、音频身份换回 base 皮肤、引用本来就指向 base 皮肤时不复制、
 * 认不出的网格原样复制、大小写不敏感找文件、找不到网格时保持原引用。
 *
 * 运行：npm run rebase:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { CASES, meshModule } from './mesh-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinRebase.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run rebase:test 的构建步骤`);
}

const { rebaseSkinPy, findCaseInsensitive, capitalizeCharacter } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);
const { rebuildMesh, isRebuilt } = meshModule;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-rebase-'));
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

const PY = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/Vayne/Vayne.bin"
}
entries: map[hash,embed] = {
    "Characters/Vayne/Skins/Skin0" = SkinCharacterDataProperties {
        skinClassification: u32 = 1
        championSkinId: i32 = 67011
        championSkinName: string = "VayneSkin11"
        skinAudioProperties: embed = skinAudioProperties {
            tagEventList: list[string] = {
                "Vayne"
                "VayneSkin11"
            }
            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Vayne_Skin11_SFX"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Skin11/Vayne_Skin11_SFX_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_sfx_VayneSkin11_VayneTumble_OnCast"
                    }
                }
            }
        }
        skinMeshProperties: embed = SkinMeshDataProperties {
            skeleton: string = "ASSETS/Characters/Vayne/Skins/Skin11/Vayne_Skin11.skl"
            simpleSkin: string = "ASSETS/Characters/Vayne/Skins/Skin11/Vayne_Skin11.skn"
        }
    }
}
`;

/** 游戏自带 base 皮肤（skin0.bin）的音频段 */
const BASE_AUDIO = {
  tagEventList: `            tagEventList: list[string] = {
                "Vayne"
            }`,
  bankUnits: `            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Vayne_Base_SFX"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Base/Vayne_Base_SFX_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_sfx_Vayne_VayneTumble_OnCast"
                    }
                }
            }`,
};

const makePy = (name) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, PY, 'utf-8');
  return file;
};

const SKN_KEY = 'assets/characters/vayne/skins/skin11/vayne_skin11.skn';
const SKL_KEY = 'assets/characters/vayne/skins/skin11/vayne_skin11.skl';
const SKN = CASES.skn_v4;
const SKL = CASES.skl_two;

const baseOut = (pack) => ({
  skn: path.join(pack, 'assets', 'characters', 'vayne', 'skins', 'base', 'vayne.skn'),
  skl: path.join(pack, 'assets', 'characters', 'vayne', 'skins', 'base', 'vayne.skl'),
});

const extract = path.join(dir, 'extract');
fs.mkdirSync(path.join(extract, 'assets', 'characters', 'vayne', 'skins', 'skin11'), {
  recursive: true,
});
// 故意用全小写文件名：bin 里的引用是大写开头，验证大小写不敏感查找
fs.writeFileSync(
  path.join(extract, 'assets', 'characters', 'vayne', 'skins', 'skin11', 'vayne_skin11.skn'),
  SKN
);
fs.writeFileSync(
  path.join(extract, 'assets', 'characters', 'vayne', 'skins', 'skin11', 'vayne_skin11.skl'),
  SKL
);

try {
  await step('角色名大写化', () => {
    assert.equal(capitalizeCharacter('vayne'), 'Vayne');
    assert.equal(capitalizeCharacter('jade_vayne'), 'Jade_Vayne');
    return 'Vayne / Jade_Vayne';
  });

  await step('大小写不敏感找文件', () => {
    const found = findCaseInsensitive(extract, 'ASSETS/Characters/Vayne/Skins/Skin11/Vayne_Skin11.skn');
    assert.ok(found, '应该找到 vayne_skin11.skn');
    assert.equal(path.basename(found), 'vayne_skin11.skn');
    return path.relative(extract, found);
  });

  await step('改写身份：网格重建到 base 路径 + 音频换回 base', () => {
    const py = makePy('skin0.py');
    const pack = path.join(dir, 'pack');
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      baseAudio: BASE_AUDIO,
      extractRoot: extract,
      outputRoot: pack,
    });
    assert.ok(result, '应该返回改写结果');
    assert.equal(result.copied.length, 2);
    const out = baseOut(pack);
    assert.ok(fs.readFileSync(out.skn).equals(rebuildMesh(SKN).data), 'SKN 应该是重建过的');
    assert.ok(fs.readFileSync(out.skl).equals(rebuildMesh(SKL).data), 'SKL 应该是重建过的');
    assert.equal(isRebuilt(fs.readFileSync(out.skn)), true);
    assert.equal(isRebuilt(fs.readFileSync(out.skl)), true);
    assert.equal(result.meshes.length, 2);
    assert.deepEqual(
      result.meshes.map((item) => item.added).sort(),
      ['null joint', 'null vertex']
    );
    assert.deepEqual(result.audioReplaced, ['tagEventList', 'bankUnits']);
    assert.deepEqual(result.audioLeftover, [], '音频段里不该再有别的皮肤的名字');

    const text = fs.readFileSync(py, 'utf-8');
    assert.match(text, /championSkinName: string = "VayneBase"/);
    assert.match(text, /skeleton: string = "ASSETS\/Characters\/Vayne\/Skins\/Base\/Vayne\.skl"/);
    assert.match(text, /simpleSkin: string = "ASSETS\/Characters\/Vayne\/Skins\/Base\/Vayne\.skn"/);
    assert.match(text, /name: string = "Vayne_Base_SFX"/);
    assert.match(text, /"Play_sfx_Vayne_VayneTumble_OnCast"/);
    assert.equal(text.includes('Vayne_Skin11_SFX'), false, '旧的音频身份不该留');
    assert.equal(text.includes('championSkinId'), false, 'base 皮肤不该带 championSkinId');
    return `2 个网格 + 2 段音频，SKN ${SKN.length}->${fs.statSync(out.skn).size} 字节`;
  });

  await step('没给 base 音频：保留原音频并报出残留的名字', () => {
    const py = makePy('no-audio.py');
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      extractRoot: extract,
      outputRoot: path.join(dir, 'pack-no-audio'),
    });
    assert.ok(result);
    assert.deepEqual(result.audioReplaced, []);
    assert.ok(
      result.audioLeftover.some((name) => name.includes('VayneSkin11')),
      '应该报出 VayneSkin11'
    );
    return result.audioLeftover.slice(0, 2).join(', ');
  });

  await step('老 Rose 补的 16 字节会被削掉再重建', () => {
    const py = makePy('padded.py');
    const pack = path.join(dir, 'pack-padded');
    const assets = new Map([
      [SKN_KEY, Buffer.concat([SKN, Buffer.alloc(16)])],
      [SKL_KEY, Buffer.concat([SKL, Buffer.alloc(16)])],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: pack,
    });
    assert.ok(result);
    const out = baseOut(pack);
    assert.ok(fs.readFileSync(out.skn).equals(rebuildMesh(SKN).data), '填充不能留在重建结果里');
    assert.ok(fs.readFileSync(out.skl).equals(rebuildMesh(SKL).data));
    return '填充已削掉';
  });

  await step('认不出的网格：原样复制并记下来', () => {
    const py = makePy('unknown.py');
    const pack = path.join(dir, 'pack-unknown');
    const assets = new Map([
      [SKN_KEY, Buffer.from('MESH2')],
      [SKL_KEY, Buffer.from('SKEL2')],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: pack,
    });
    assert.ok(result);
    assert.deepEqual(
      result.meshes.map((item) => item.added),
      ['unchanged', 'unchanged']
    );
    const out = baseOut(pack);
    assert.equal(fs.readFileSync(out.skn, 'utf-8'), 'MESH2');
    return 'unchanged';
  });

  await step('引用本来就是 base 路径：不复制，沿用游戏自带文件', () => {
    const py = path.join(dir, 'base-ref.py');
    fs.writeFileSync(
      py,
      PY.replace(
        /skeleton: string = "[^"]*"/,
        'skeleton: string = "ASSETS/Characters/Vayne/Skins/Base/Vayne.skl"'
      ).replace(
        /simpleSkin: string = "[^"]*"/,
        'simpleSkin: string = "ASSETS/Characters/Vayne/Skins/Base/Vayne.skn"'
      ),
      'utf-8'
    );
    const pack = path.join(dir, 'pack-base-ref');
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      baseAudio: BASE_AUDIO,
      extractRoot: extract,
      outputRoot: pack,
    });
    assert.ok(result);
    assert.equal(result.copied.length, 0);
    assert.equal(fs.existsSync(baseOut(pack).skn), false);
    const text = fs.readFileSync(py, 'utf-8');
    assert.match(text, /simpleSkin: string = "ASSETS\/Characters\/Vayne\/Skins\/Base\/Vayne\.skn"/);
    assert.match(text, /championSkinName: string = "VayneBase"/);
    return '沿用原引用';
  });

  await step('找不到网格时保留原引用，但仍改 championSkinName', () => {
    const py = makePy('missing.py');
    const pack = path.join(dir, 'pack-missing');
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      extractRoot: path.join(dir, 'no-such-extract'),
      outputRoot: pack,
    });
    assert.ok(result);
    assert.equal(result.copied.length, 0);
    const text = fs.readFileSync(py, 'utf-8');
    assert.match(text, /championSkinName: string = "VayneBase"/);
    assert.match(text, /Skins\/Skin11\/Vayne_Skin11\.skl/);
    return '原引用保留';
  });

  await step('直接从 assets Map 提供网格（生产流程走这条）', () => {
    const py = makePy('assets.py');
    const pack = path.join(dir, 'pack-assets');
    const assets = new Map([
      [SKN_KEY, SKN],
      [SKL_KEY, SKL],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: pack,
    });
    assert.ok(result);
    assert.equal(result.copied.length, 2);
    assert.ok(fs.readFileSync(baseOut(pack).skn).equals(rebuildMesh(SKN).data));
    return 'assets Map 生效';
  });

  await step('没有 skeleton/simpleSkin 的 bin：跳过', () => {
    const py = path.join(dir, 'plain.py');
    fs.writeFileSync(py, '#PROP_text\ntype: string = "PROP"\n', 'utf-8');
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      extractRoot: extract,
      outputRoot: path.join(dir, 'pack-plain'),
    });
    assert.equal(result, null);
    return '跳过';
  });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nbase-skin 改写测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
