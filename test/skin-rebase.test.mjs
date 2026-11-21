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

const {
  rebaseSkinPy,
  findCaseInsensitive,
  capitalizeCharacter,
  readGearShowList,
  unhideSubmeshes,
  readGearVfxMap,
  applyGearVfxMap,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);
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
    // 游戏自带的 base skin0.bin 里有 championSkinId（Sona 是 37000），Rose 也不删：
    // 多形态皮肤的 gear form 与音频靠它绑定，删掉游戏会当成没有皮肤身份
    assert.match(text, /championSkinId: i32 = 67011/, 'championSkinId 要保留');
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

  // ── objectPath / skinUpgradeData / base 引用照抄 ───────────────────────────
  const fnv = (name) => {
    let hash = 0x811c9dc5;
    for (const byte of Buffer.from(name.toLowerCase(), 'utf8')) {
      hash ^= byte;
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };

  const withExtra = (extra) => {
    const file = path.join(dir, `extra-${Math.random().toString(16).slice(2)}.py`);
    fs.writeFileSync(file, PY.replace(/\n}\n$/, `\n${extra}\n}\n`), 'utf-8');
    return file;
  };

  await step('objectPath：entry 自己的路径也换成 Skin0（哈希形态）', () => {
    const oldHash = fnv('Characters/Vayne/Skins/Skin11');
    const py = withExtra(`        objectPath: hash = 0x${oldHash}`);
    const assets = new Map([
      [SKN_KEY, SKN],
      [SKL_KEY, SKL],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      skinId: 11,
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: path.join(dir, 'pack-objectpath'),
    });
    assert.ok(result);
    assert.equal(result.objectPathRenamed, true, '应该认出来并改写');
    const text = fs.readFileSync(py, 'utf-8');
    assert.ok(
      text.includes(`0x${fnv('Characters/Vayne/Skins/Skin0')}`),
      '要换成 Skin0 的哈希'
    );
    assert.equal(text.includes(`0x${oldHash}`), false, '旧哈希不该留');
    return `0x${oldHash} -> Skin0`;
  });

  await step('skinUpgradeData：gear 目标不在本包里去整段', () => {
    const py = withExtra(`        skinUpgradeData: embed = SkinUpgradeData {
            mGearSkinUpgrades: list[link] = {
                "Characters/Vayne/Skins/Skin11/Gear/Gun2025"
            }
        }`);
    const assets = new Map([
      [SKN_KEY, SKN],
      [SKL_KEY, SKL],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      skinId: 11,
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: path.join(dir, 'pack-upgrade-dangling'),
    });
    assert.ok(result);
    assert.equal(result.upgradeDropped, true, '目标不在包里应该去掉');
    assert.equal(fs.readFileSync(py, 'utf-8').includes('skinUpgradeData'), false);
    return '去了 skinUpgradeData';
  });

  await step('skinUpgradeData：gear 目标在本包里就保留', () => {
    const py = withExtra(`        skinUpgradeData: embed = SkinUpgradeData {
            mGearSkinUpgrades: list[link] = {
                "Characters/Vayne/Skins/Skin11/Gear/Gun2025"
            }
        }
    "Characters/Vayne/Skins/Skin11/Gear/Gun2025" = GearSkinUpgrade {
        mGearData: pointer = GearData {
        }
    }`);
    const assets = new Map([
      [SKN_KEY, SKN],
      [SKL_KEY, SKL],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      skinId: 11,
      baseChampionSkinName: 'VayneBase',
      assets,
      outputRoot: path.join(dir, 'pack-upgrade-kept'),
    });
    assert.ok(result);
    assert.equal(result.upgradeDropped, false, '目标在包里应该保留');
    assert.equal(fs.readFileSync(py, 'utf-8').includes('skinUpgradeData'), true);
    return '保留';
  });

  await step('骨架/网格引用照抄 base bin 的写法（大小写照抄）', () => {
    const py = makePy('base-case.py');
    const assets = new Map([
      [SKN_KEY, SKN],
      [SKL_KEY, SKL],
    ]);
    const result = rebaseSkinPy({
      pyPath: py,
      character: 'vayne',
      baseChampionSkinName: 'VayneBase',
      baseSkeleton: 'ASSETS/Characters/VaYnE/Skins/Base/VaYnE.skl',
      baseSimpleSkin: 'ASSETS/Characters/VaYnE/Skins/Base/VaYnE.skn',
      assets,
      outputRoot: path.join(dir, 'pack-case'),
    });
    assert.ok(result);
    assert.equal(result.skeleton, 'ASSETS/Characters/VaYnE/Skins/Base/VaYnE.skl');
    const text = fs.readFileSync(py, 'utf-8');
    assert.match(text, /skeleton: string = "ASSETS\/Characters\/VaYnE\/Skins\/Base\/VaYnE\.skl"/);
    // 文件按小写路径落盘（WAD 路径哈希不分大小写）
    assert.ok(
      fs.existsSync(
        path.join(dir, 'pack-case', 'assets', 'characters', 'vayne', 'skins', 'base', 'vayne.skl')
      )
    );
    return '大小写照抄';
  });

  await step('gear 的 mCharacterSubmeshesToShow：按哈希读出来', () => {
    const link = 'Characters/Vayne/Skins/Skin11/Gear/Gun2025';
    const py = `entries: map[hash, embed] = {
    0x${fnv(link)} = 0x27dd6361 {
        0x639b0013: pointer = 0xb43441ae {
            mCharacterSubmeshesToShow: list[hash] = { 0x${fnv('A_Gun25')}, 0x${fnv('A_Gun25_Gem')} }
        }
    }
    "Characters/Other" = OtherData {
    }
}
`;
    const show = readGearShowList(py, link);
    assert.deepEqual(show, [fnv('A_Gun25'), fnv('A_Gun25_Gem')]);
    assert.equal(readGearShowList(py, 'Characters/Vayne/Skins/Skin11/Gear/Nope'), null);
    // 精简名字表里 link 是哈希时也能认
    assert.deepEqual(readGearShowList(py, `0x${fnv(link)}`), show);
    return show.join(', ');
  });

  await step('unhideSubmeshes：把 gear 会显示的 submesh 从隐藏列表删掉', () => {
    const a = fnv('A_Gun25');
    const b = fnv('A_Gun25_Gem');
    const text = `        initialSubmeshToHide: string = "A_Gun25 A_Gun25_Gem B_Gun24 C_Gun23"\n`;
    const result = unhideSubmeshes(text, [a, b, fnv('NotThere')]);
    assert.deepEqual(result.removed, ['A_Gun25', 'A_Gun25_Gem']);
    assert.match(result.text, /initialSubmeshToHide: string = "B_Gun24 C_Gun23"/);
    // 字段名是哈希（精简名字表）时同样能改
    const hashed = `        0x${fnv('initialSubmeshToHide')}: string = "A_Gun25 B_Gun24"\n`;
    const hashedResult = unhideSubmeshes(hashed, [a]);
    assert.deepEqual(hashedResult.removed, ['A_Gun25']);
    assert.match(hashedResult.text, /string = "B_Gun24"/);
    return 'A_Gun25, A_Gun25_Gem';
  });

  await step('gear 的 mVFXResourceResolver：value 是哈希时用 particlePath 反查路径', () => {
    const link = 'Characters/Vayne/Skins/Skin11/Gear/Gun2025';
    const particlePath = 'Characters/Vayne/Skins/Skin11/Gear/Gun2025/Particles/Vayne_Skin11_W_Max00';
    const gearPy = `entries: map[hash, embed] = {
    0x${fnv(link)} = 0x27dd6361 {
        0x639b0013: pointer = 0xb43441ae {
            mVFXResourceResolver: pointer = ResourceResolver {
                resourceMap: map[hash, link] = {
                    0x${fnv('Vayne_W_Max_gear_key')} = 0x${fnv(particlePath)}
                }
            }
        }
    }
    "Characters/Vayne/Skins/Vayne_Particle" = VfxSystemDefinitionData {
        particlePath: string = "${particlePath}"
    }
}
`;
    const pairs = readGearVfxMap(gearPy, link);
    assert.equal(pairs?.length, 1);
    assert.equal(pairs[0].path, particlePath, '要反查出粒子路径');
    return pairs[0].path;
  });

  await step('applyGearVfxMap：把皮肤 Resources 里的 0x0 补成粒子（名字 key 和哈希 key 都补）', () => {
    const particlePath = 'Characters/Vayne/Skins/Skin11/Gear/Gun2025/Particles/Vayne_Skin11_W_Max00';
    const pairs = [
      { key: `0x${fnv('Vayne_W_Max_gear_key')}`, value: `"${particlePath}"`, path: particlePath },
    ];
    const skinPy = `entries: map[hash, embed] = {
    "Characters/Vayne/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash, link] = {
            "Vayne_W_Max" = 0x0
            0x${fnv('Vayne_W_Max_gear_key')} = 0x0
        }
    }
}
`;
    const applied = applyGearVfxMap(skinPy, pairs);
    assert.deepEqual(applied.mapped.sort(), ['Vayne_W_Max', `0x${fnv('Vayne_W_Max_gear_key')}`].sort());
    assert.match(applied.text, new RegExp(`"Vayne_W_Max" = "${particlePath}"`));
    assert.doesNotMatch(applied.text, /= 0x0/);
    return '2 条';
  });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nbase-skin 改写测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
