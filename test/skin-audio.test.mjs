/**
 * 音频身份改写的单元测试（不需要游戏和 cslol-tools）。
 *
 * 覆盖：从 ritobin 文本里取出 tagEventList / bankUnits 两段、整段替换、
 * 字符串里的花括号不干扰配对、名字里「别的皮肤」的标记识别。
 *
 * 运行：npm run audio:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinAudio.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run audio:test 的构建步骤`);
}

const { readAudioBlocks, replaceAudioBlocks, skinAudioMarkers } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

const SKIN = `entries: map[hash,embed] = {
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
                        "ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Skin11/Vayne_Skin11_SFX_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_sfx_VayneSkin11_VayneTumble_OnCast"
                    }
                }
                BankUnit {
                    name: string = "Vayne_Skin11_VO"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Vayne/Skins/Skin11/Vayne_Skin11_VO_audio.bnk"
                    }
                    voiceOver: bool = true
                }
            }
        }
        championSkinName: string = "VayneSkin11"
    }
}
`;

const BASE = `entries: map[hash,embed] = {
    "Characters/Vayne/Skins/Skin0" = SkinCharacterDataProperties {
        skinAudioProperties: embed = skinAudioProperties {
            tagEventList: list[string] = {
                "Vayne"
            }
            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Vayne_Base_SFX"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Wwise2016/SFX/Characters/Vayne/Skins/Base/Vayne_Base_SFX_audio.bnk"
                    }
                    events: list[string] = {
                        "Play_sfx_Vayne_VayneTumble_OnCast"
                    }
                }
            }
        }
        championSkinName: string = "VayneBase"
    }
}
`;

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

step('取出两段音频身份', () => {
  const blocks = readAudioBlocks(SKIN);
  assert.ok(blocks);
  assert.match(blocks.tagEventList, /^ *tagEventList: list\[string\] = \{/);
  assert.match(blocks.tagEventList, /"VayneSkin11"\n *\}$/);
  assert.match(blocks.bankUnits, /^ *bankUnits: list2\[embed\] = \{/);
  assert.match(blocks.bankUnits, /Vayne_Skin11_VO_audio\.bnk"/);
  assert.match(blocks.bankUnits, /voiceOver: bool = true\n *\}\n *\}$/);
  return `${blocks.tagEventList.split('\n').length} + ${blocks.bankUnits.split('\n').length} 行`;
});

step('换掉两段，其它字段不动', () => {
  const base = readAudioBlocks(BASE);
  assert.ok(base);
  const { text, replaced } = replaceAudioBlocks(SKIN, base);
  assert.deepEqual(replaced, ['tagEventList', 'bankUnits']);
  assert.match(text, /name: string = "Vayne_Base_SFX"/);
  assert.match(text, /\["Vayne"\]|"Vayne"\n *\}/);
  assert.equal(text.includes('Vayne_Skin11_SFX'), false, '旧的 bank 单位不该留');
  assert.equal(text.includes('VayneSkin11_VayneTumble'), false, '旧的事件名不该留');
  assert.match(text, /championSkinName: string = "VayneSkin11"/, '这个函数只管音频两段');
  assert.equal(text.includes('championSkinId'), false);
  return '两段替换';
});

step('已经是 base 的音频段就不动', () => {
  const base = readAudioBlocks(BASE);
  const once = replaceAudioBlocks(BASE, base);
  assert.deepEqual(once.replaced, []);
  assert.equal(once.text, BASE);
  return '幂等';
});

step("字符串里的花括号不影响配对", () => {
  const tricky = SKIN.replace('"Vayne"', '"Vayne{brace}"');
  const blocks = readAudioBlocks(tricky);
  assert.ok(blocks);
  assert.match(blocks.tagEventList, /"Vayne\{brace\}"/);
  assert.match(blocks.bankUnits, /Vayne_Base|Vayne_Skin11_VO/);
  return '配对正确';
});

step('目标里没有这两段：不改，也不报错', () => {
  const plain = 'entries: map[hash,embed] = {\n}\n';
  const base = readAudioBlocks(BASE);
  const result = replaceAudioBlocks(plain, base);
  assert.deepEqual(result.replaced, []);
  assert.equal(result.text, plain);
  assert.equal(readAudioBlocks(plain), null);
  return '原样返回';
});

step('名字里「别的皮肤」的标记', () => {
  const markers = skinAudioMarkers(
    ['"VayneSkin11"', '"Vayne_Skin11_SFX"', '"Vayne"', '"Vayne_Base_SFX"', '"Vayne_Skin11_Particles"'].join('\n'),
    'vayne'
  );
  assert.deepEqual(markers.sort(), ['VayneSkin11', 'Vayne_Skin11_SFX']);
  return markers.join(', ');
});

step('base 皮肤自己的音频段不算命中', () => {
  const base = readAudioBlocks(BASE);
  assert.ok(base);
  assert.deepEqual(skinAudioMarkers(`${base.tagEventList}\n${base.bankUnits}`, 'vayne'), []);
  return '无命中';
});

console.log(failures === 0 ? '\n音频身份改写测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
