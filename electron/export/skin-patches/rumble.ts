/**
 * Rumble（英雄目录 `rumble`）专属补丁（builder 8）。
 *
 * 现象：builder 7 纯数据重建的 68003，R 的「燃烧」地面特效完全不出现。
 *
 * 我先按「抄一份能跑的包」做了对照（Rose 的 `skins/68/68003/68003.fantome`），
 * 逐条比对后把不依赖它的部分全部删掉了，只留下**游戏数据里确实不存在**的那一层：
 *
 * 1. 整段 `Rumble_Skin03_R_tar_team_green` 粒子定义（1,471 行）——皮肤自己的
 *    `skin3.bin` 里就有（vanilla 1,206 行），随包就已经在，不需要抄。
 * 2. `0x74ad149b → 0xa075fcc1` 这条映射——它只是为了让上面那段副本可达，副本没了就不需要。
 * 3. 真正缺的只有 props 里的触发条件：`PersistentEffectConditions`（+ 占位 `ChromaData`）。
 *    把游戏里 Rumble 的 52 个 bin 全转成文本扫过，`PersistentEffectConditions` /
 *    `PersistentVfxData` **0 命中**，两个 effectKey（`0x97e29b7d` / `0x68ba7d5d`）也
 *    不存在于任何 bin —— 这一层只能补。
 *
 * 条件是「buff 驱动、挂在骨头上」的通用结构，照着游戏里其它英雄同类皮肤的结构写即可：
 * `RumbleFlameThrower` / `RumbleDangerZoneBuff` / `RumbleOverheat` 都是游戏数据里的真实
 * buff 名，挂点 `R_Flame` 来自皮肤骨架（`readSkeletonJointNames()` 能读出来）。
 *
 * 两块内容：
 * 1. `propsInsert`：`ChromaData` 占位 + `PersistentEffectConditions`（三段条件）；
 * 2. `resourceMap`：补三条映射（R 的燃烧引用 + 两个 `effectKey`），并删掉 base 皮肤
 *    resolver 里多出来的两条同目标 key（不删则 Q 的火焰两个方向各喷一次）。
 *    第三条的值 `0xa075fcc1` 是个条目 key，粒子系统本体由 `copyResolvedEntries()` 在生成时
 *    按 hash 从随包的皮肤 bin 里搬进来 —— 那 1,206 行是游戏数据，不在补丁里。
 */
import type { SkinPatch } from '../skin-patch';

/** 身份对象里要补的字段（8 空格缩进） */
const R_PROPS_INSERT = `
        ChromaData: pointer = 0xe7ee4f28 { }
        PersistentEffectConditions: list2[pointer] = {
            PersistentEffectConditionData {
                OwnerCondition: pointer = AllTrueMaterialDriver {
                    mDrivers: list[pointer] = {
                        HasBuffDynamicMaterialBoolDriver {
                            mScriptName: string = "RumbleFlameThrower"
                        }
                        FixedDurationTriggeredBoolDriver {
                            mBoolDriver: pointer = AllTrueMaterialDriver {
                                mDrivers: list[pointer] = {
                                    OneTrueMaterialDriver {
                                        mDrivers: list[pointer] = {
                                            HasBuffDynamicMaterialBoolDriver {
                                                mScriptName: string = "RumbleDangerZoneBuff"
                                            }
                                            HasBuffDynamicMaterialBoolDriver {
                                                mScriptName: string = "RumbleOverheat"
                                            }
                                        }
                                    }
                                    HasBuffDynamicMaterialBoolDriver {
                                        mScriptName: string = "RumbleFlameThrower"
                                    }
                                }
                            }
                            mCustomDuration: f32 = 2.57777
                        }
                    }
                }
                PersistentVfxs: list2[embed] = {
                    PersistentVfxData {
                        boneName: string = "R_Flame"
                        effectKey: hash = 0x97e29b7d
                    }
                }
            }
            PersistentEffectConditionData {
                OwnerCondition: pointer = AllTrueMaterialDriver {
                    mDrivers: list[pointer] = {
                        OneTrueMaterialDriver {
                            mDrivers: list[pointer] = {
                                HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "RumbleDangerZoneBuff"
                                }
                                HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "RumbleOverheat"
                                }
                            }
                        }
                        OneTrueMaterialDriver {
                            mDrivers: list[pointer] = {
                                HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "RumbleFlameThrower"
                                }
                                IsCastingBoolDriver {
                                    SpellSlot: u32 = 0
                                }
                            }
                        }
                    }
                }
                PersistentVfxs: list2[embed] = {
                    PersistentVfxData {
                        boneName: string = "R_Flame"
                        effectKey: hash = 0x68ba7d5d
                    }
                }
            }
            PersistentEffectConditionData {
                OwnerCondition: pointer = AllTrueMaterialDriver {
                    mDrivers: list[pointer] = {
                        NotMaterialDriver {
                            mDriver: pointer = OneTrueMaterialDriver {
                                mDrivers: list[pointer] = {
                                    HasBuffDynamicMaterialBoolDriver {
                                        mScriptName: string = "RumbleDangerZoneBuff"
                                    }
                                    HasBuffDynamicMaterialBoolDriver {
                                        mScriptName: string = "RumbleOverheat"
                                    }
                                }
                            }
                        }
                        HasBuffDynamicMaterialBoolDriver {
                            mScriptName: string = "RumbleFlameThrower"
                        }
                    }
                }
                PersistentVfxs: list2[embed] = {
                    PersistentVfxData {
                        boneName: string = "R_Flame"
                        effectKey: hash = 0x97e29b7d
                    }
                }
            }
        }
`;

export const rumblePatch: SkinPatch = {
  champion: 'rumble',
  // 条件里的挂点骨骼/粒子是 Skin3 命名空间的，只套在验证过的 3 号皮肤上
  skins: [3],
  note: 'R 燃烧特效的触发条件（游戏数据里没有这一层），挂点 R_Flame',
  propsInsert: [
    {
      after: 'skinParent',
      label: 'R 燃烧特效条件（ChromaData / PersistentEffectConditions）',
      text: R_PROPS_INSERT,
    },
  ],
  /**
   * 三条映射（都是不透明 hash，路径推不出来，只能按游戏里实际生效的值写）：
   * - `0x74ad149b`：R 的「燃烧」引用（游戏数据里指向 5 行的 `r_burn` 存根），要指到真正的
   *   燃烧系统 `Rumble_Skin03_R_tar_team_green`（`0xa075fcc1`）。这个 value 是个**条目
   *   key**，所以 `copyResolvedEntries()` 会按 hash 把系统本体从随包的皮肤 bin 里搬进 base
   *   bin —— 内容来自游戏数据，不在补丁里抄。不指的话 R 的地面特效不出现（实测）。
   * - `0x97e29b7d` / `0x68ba7d5d`：条件里两个 `PersistentVfxData.effectKey`，
   *   分别解析到 `Rumble_Skin03_Q_cas_01` / `_02` 的路径 hash（`0xe70b8192` / `0xe60b7fff`）；
   * - 删掉 `0x52c319c0` / `0x55c31e79`：base 皮肤那份 resolver 里指向同一对粒子的两条，
   *   留着就会同一段粒子渲染两遍（Q 火焰两个方向）。
   */
  resourceMap: {
    label: 'R 燃烧特效的 3 条映射',
    set: {
      '0x74ad149b': '0xa075fcc1',
      '0x97e29b7d': '0xe70b8192',
      '0x68ba7d5d': '0xe60b7fff',
    },
    remove: ['0x52c319c0', '0x55c31e79'],
  },
  /**
   * 游戏把 R 的地面裂坑拆成了 6 个独立系统（`Rumble_Skin03_R_Crater_01..06`，各 1 个
   * emitter），tar 系统（13 个 emitter）单独挂上去在游戏里几乎看不见 —— 实测 R 完全没有
   * 效果。能跑的包是把裂坑的 emitter 并进 tar 系统（两边逐字节相同），这里按名字前缀在
   * 生成时把它们的 emitter 并进来，emitter 本体全部来自游戏数据。
   */
  composeEntries: [
    {
      key: '0xa075fcc1',
      alsoByName: 'Rumble_Skin03_R_Crater_',
    },
  ],
};
