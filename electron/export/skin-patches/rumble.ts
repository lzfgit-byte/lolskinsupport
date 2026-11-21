/**
 * Rumble（英雄目录 `rumble`）专属补丁（builder 8）。
 *
 * 出处：Rose 的 `skins/68/68003/68003.fantome`（手工调出来的包，游戏内验证过）。
 * 现象：builder 7 纯数据重建的 68003，R 的「燃烧」地面特效完全不出现。逐字段比对后确认
 * 这一层在游戏数据里根本不存在 —— 不是被我们删掉，而是必须在包里补上：
 *
 * 1. `ChromaData`：炫彩数据的空指针占位，那份包里显式写了；
 * 2. `PersistentEffectConditions`：R 的常驻特效触发条件（`RumbleFlameThrower` buff 的
 *    `AllTrueMaterialDriver` + `FixedDurationTriggeredBoolDriver` 定时驱动），没有它
 *    base-slot 身份下 R 的火焰永远挂不上；
 * 3. `0xa075fcc1 = VfxSystemDefinitionData`：整段 R 粒子定义
 *    （`Characters/Rumble/Skins/Skin3/Particles/Rumble_Skin03_R_tar_team_green`，
 *    含 `particleName` / `particlePath` / `soundPersistentDefault` / 内部 `objectPath`），
 *    就是第 2 项的条件挂上去的那个系统。
 *
 * 两块文本都是从那份包里机械提取的**数据**（花括号配平、无反引号 / `${}` / 反斜杠，
 * 所以能原样放进模板字符串）。
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

/** entries 表里要补的 VfxSystemDefinitionData 条目（4 空格缩进） */
const R_VFX_ENTRY = `    0xa075fcc1 = VfxSystemDefinitionData {
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 10
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.15
                }
                particleLinger: option[f32] = { 10.15 }
                lifetime: option[f32] = { 0.1 }
                emitterName: string = "groundflash_skin03"
                importance: u8 = 3
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, 20, 0 }
                }
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/Base/Particles/Rumble_alpha_12.tex"
                blendMode: u8 = 4
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 90, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 90, 1, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 20, 20, 20 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.5, 1 }
                        values: list[vec3] = {
                            { 5, 5, 5 }
                            { 10, 10, 10 }
                            { 15, 15, 15 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Flash.tex"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 300
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.9
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.75, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.9 }
                    }
                }
                particleLinger: option[f32] = { 10.9 }
                lifetime: option[f32] = { 0.1 }
                emitterName: string = "Dust_out_skin03"
                birthVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 600, 0, -600 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.5, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.2, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 600, 0, -600 } }
                    }
                }
                birthDrag: embed = ValueVector3 {
                    constantValue: vec3 = { 5, 5, 5 }
                }
                worldAcceleration: embed = IntegratedValueVector3 {
                    constantValue: vec3 = { 0, -20, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, -20, 0 } }
                    }
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 60, 0, 0 }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {
                            constantValue: f32 = 1
                            dynamics: pointer = VfxAnimatedFloatVariableData {
                                probabilityTables: list[pointer] = {
                                    VfxProbabilityTableData {
                                        keyTimes: list[f32] = { 0, 1 }
                                        keyValues: list[f32] = { 0, 360 }
                                    }
                                }
                                times: list[f32] = { 0 }
                                values: list[f32] = { 1 }
                            }
                        }
                    }
                    emitRotationAxes: list[vec3] = { { 0, 1.0000001, 0 } }
                }
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 30, 0 }
                }
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/Base/Particles/Rumble_alpha_12.tex"
                blendMode: u8 = 4
                Color: embed = ValueColor {
                    constantValue: vec4 = { 1, 1, 1, 0.5 }
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.2, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 0 }
                            { 1, 1, 1, 0.5 }
                            { 1, 1, 1, 0.5 }
                        }
                    }
                }
                pass: i16 = -10
                disableBackfaceCull: bool = true
                isDirectionOriented: flag = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 60, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 0.5, 0.501, 1 }
                                keyValues: list[f32] = { 0, 0, 180, 180 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 60, 1, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 150, 120, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 150, 120, 0 } }
                    }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[vec3] = {
                            { 0.5, 0.5, 0 }
                            { 1, 1, 0 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_E_Mist_03.tex"
                uvMode: u8 = 2
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { -1, 0 }
                    dynamics: pointer = VfxAnimatedVector2fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.2, 0.8 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec2] = { { -1, 0 } }
                    }
                }
                birthUVOffset: embed = ValueVector2 {
                    constantValue: vec2 = { 0.5, 0.5 }
                    dynamics: pointer = VfxAnimatedVector2fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 0.5 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 0.5 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[vec2] = { { 0.5, 0.5 } }
                    }
                }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 8
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.3
                }
                particleLinger: option[f32] = { 10.3 }
                lifetime: option[f32] = { 0.1 }
                isSingleParticle: flag = true
                emitterName: string = "blast_sphere_skin03"
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, -30, 0 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_sphere.scb"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.4, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0.45 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                pass: i16 = 150
                isRandomStartFrame: flag = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 1, -40 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 1, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 1, -40 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 7, 8, 7 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.4, 1 }
                        values: list[vec3] = {
                            { 0, 0, 0 }
                            { 0.7, 0.7, 0.7 }
                            { 1.2, 1.2, 1.2 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_E_impact_color_02.tex"
                numFrames: u16 = 4
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { 1.5, 0 }
                }
                texDiv: vec2 = { 2, 2 }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLinger: option[f32] = { 11 }
                lifetime: option[f32] = { 0.1 }
                emitterName: string = "new_cracks_01_skin03_add_fade"
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 5, 0 }
                }
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_color_33.tex"
                pass: i16 = 10
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 90, 0, 90 }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 280, 280, 0 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_cracks_glow_03.tex"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.5
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.9, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.5 }
                    }
                }
                particleLinger: option[f32] = { 3 }
                lifetime: option[f32] = { 0.1 }
                isSingleParticle: flag = true
                emitterLinger: option[f32] = { 1 }
                emitterName: string = "Impact_Dome"
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/rumble_skin03_r_dome.scb"
                    }
                }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Dome_RGBA.tex"
                blendMode: u8 = 1
                pass: i16 = 5
                colorLookUpTypeY: u8 = 1
                disableBackfaceCull: bool = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 1, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 2.5, 2.5, 2.5 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.5, 1 }
                        values: list[vec3] = {
                            { 0.1, 0.1, 0.1 }
                            { 0.9, 0.9, 0.9 }
                            { 1.2, 1.2, 1.2 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Dome.tex"
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { -1.5, -1.1 }
                }
                texDiv: vec2 = { 0.5, 1 }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 45
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.4
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.1, 1.6 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.4 }
                    }
                }
                particleLinger: option[f32] = { 0.1 }
                lifetime: option[f32] = { 0.1 }
                isSingleParticle: flag = true
                fieldCollectionDefinition: pointer = VfxFieldCollectionDefinitionData {
                    fieldNoiseDefinitions: list[embed] = {
                        VfxFieldNoiseDefinitionData {
                            axisFraction: vec3 = { 1, 1, 1 }
                        }
                    }
                }
                emitterName: string = "Rock_Ring"
                birthOrbitalVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 0.2, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 1, -1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 0.2, 0 } }
                    }
                }
                birthVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 900, 1200, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.7, 0.8 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.1, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 900, 1200, 0 } }
                    }
                }
                birthDrag: embed = ValueVector3 {
                    constantValue: vec3 = { 5, 5, 5 }
                }
                worldAcceleration: embed = IntegratedValueVector3 {
                    constantValue: vec3 = { 0, -400, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, -400, 0 } }
                    }
                }
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 50, 0, 0 }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {
                            constantValue: f32 = 1
                            dynamics: pointer = VfxAnimatedFloatVariableData {
                                probabilityTables: list[pointer] = {
                                    VfxProbabilityTableData {
                                        keyTimes: list[f32] = { 0, 1 }
                                        keyValues: list[f32] = { 0, 360 }
                                    }
                                }
                                times: list[f32] = { 0 }
                                values: list[f32] = { 1 }
                            }
                        }
                    }
                    emitRotationAxes: list[vec3] = { { 0, 1.0000001, 0 } }
                }
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 30, 0 }
                }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/Base/Particles/Rumble_alpha_20.tex"
                blendMode: u8 = 1
                pass: i16 = 10
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 90, 0, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -90, 90 }
                            }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 90, 0, 0 } }
                    }
                }
                birthRotationalVelocity0: embed = ValueVector3 {
                    constantValue: vec3 = { 100, 1600, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 100, 1600, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 20, 20, 20 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 20, 20, 20 } }
                    }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.2, 1 }
                        values: list[vec3] = {
                            { 0, 0, 0 }
                            { 1, 1, 1 }
                            { 0, 0, 0 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Rocks_03.tex"
                numFrames: u16 = 4
                startFrame: u16 = 1
                texDiv: vec2 = { 2, 2 }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.5
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.9, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.5 }
                    }
                }
                particleLinger: option[f32] = { 3 }
                lifetime: option[f32] = { 0.1 }
                isSingleParticle: flag = true
                emitterLinger: option[f32] = { 1 }
                emitterName: string = "Impact_Ring"
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/rumble_skin03_r_dome_ring.scb"
                    }
                }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Dome_Ring_RGBA.tex"
                blendMode: u8 = 1
                pass: i16 = 5
                colorLookUpTypeY: u8 = 1
                disableBackfaceCull: bool = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 1, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 2.7, 3.5, 2.7 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.3, 0.6, 1 }
                        values: list[vec3] = {
                            { 0.1, 0.1, 0.1 }
                            { 0.6, 2, 0.6 }
                            { 0.9, 1.2, 0.9 }
                            { 1.2, 0.7, 1.2 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Dome_Ring.tex"
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { -3, 0 }
                }
                texDiv: vec2 = { 0.33, 1 }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.4
                }
                particleLinger: option[f32] = { 1 }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Ring_Smoke"
                birthOrbitalVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 0, -1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 2.5, 3 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, -1, 0 } }
                    }
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mSimpleMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Smoke_Ring.scb"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.3, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                disableBackfaceCull: bool = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 1, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 1, 0 } }
                    }
                }
                isLocalOrientation: flag = false
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 2.5, 1.5, 2.5 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 0.6, 1 }
                        values: list[vec3] = {
                            { 0.3, 0.3, 0.3 }
                            { 0.9, 0.9, 0.9 }
                            { 1, 1, 1 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Smoke_Ring.tex"
                uvMode: u8 = 2
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { 0, 1 }
                }
                birthUVOffset: embed = ValueVector2 {
                    constantValue: vec2 = { 1, 1 }
                    dynamics: pointer = VfxAnimatedVector2fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec2] = { { 1, 1 } }
                    }
                }
                textureMult: pointer = VfxTextureMultDefinitionData {
                    textureMult: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Smoke_Ring_Mult.tex"
                    birthUvScrollRateMult: embed = ValueVector2 {
                        constantValue: vec2 = { -0, 2.2 }
                    }
                    birthUVOffsetMult: embed = ValueVector2 {
                        constantValue: vec2 = { 1, 1 }
                        dynamics: pointer = VfxAnimatedVector2fVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {
                                    keyTimes: list[f32] = { 0, 1 }
                                    keyValues: list[f32] = { 0, 1 }
                                }
                                VfxProbabilityTableData { }
                                }
                            times: list[f32] = { 0 }
                            values: list[vec2] = { { 1, 1 } }
                        }
                    }
                }
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.1
                rate: embed = ValueFloat {
                    constantValue: f32 = 10
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.7
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.6, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.7 }
                    }
                }
                particleLinger: option[f32] = { 0.5 }
                lifetime: option[f32] = { 5 }
                emitterName: string = "Core_Glow"
                birthVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 300, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 1.2, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 300, 0 } }
                    }
                }
                birthDrag: embed = ValueVector3 {
                    constantValue: vec3 = { 2, 0.5, 2 }
                }
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 80, 0, 80 }
                        dynamics: pointer = VfxAnimatedVector3fVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {
                                    keyTimes: list[f32] = { 0, 1 }
                                    keyValues: list[f32] = { -1, 1 }
                                }
                                VfxProbabilityTableData { }
                                VfxProbabilityTableData {
                                    keyTimes: list[f32] = { 0, 1 }
                                    keyValues: list[f32] = { -1, 1 }
                                }
                                }
                            times: list[f32] = { 0 }
                            values: list[vec3] = { { 80, 0, 80 } }
                        }
                    }
                }
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 30, 0 }
                }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Core_RGBA.tex"
                blendMode: u8 = 4
                pass: i16 = 100
                colorLookUpTypeY: u8 = 3
                isUniformScale: flag = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { 1, 1, 1 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 360 }
                            }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 1, 1, 1 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 90, 90, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.5, 1 }
                            }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 90, 90, 0 } }
                    }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[vec3] = {
                            { 0.5, 0.5, 1 }
                            { 2, 2, 1 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Core_Mist.tex"
                uvMode: u8 = 2
                birthUvScrollRate: embed = ValueVector2 {
                    constantValue: vec2 = { 0, 0.5 }
                }
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 50
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.2
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.4, 4 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.2 }
                    }
                }
                particleLinger: option[f32] = { 10.2 }
                lifetime: option[f32] = { 5 }
                emitterName: string = "Sparks_01"
                birthOrbitalVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 4, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -1, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 4, 0 } }
                    }
                }
                birthVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 800, 1400, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -1, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.3, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -1, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 800, 1400, 0 } }
                    }
                }
                birthDrag: embed = ValueVector3 {
                    constantValue: vec3 = { 3, 3, 3 }
                }
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 150, 0, 0 }
                        dynamics: pointer = VfxAnimatedVector3fVariableData {
                            probabilityTables: list[pointer] = {
                                VfxProbabilityTableData {
                                    keyTimes: list[f32] = { 0, 1 }
                                    keyValues: list[f32] = { 0, 0.6 }
                                }
                                VfxProbabilityTableData { }
                                VfxProbabilityTableData { }
                                }
                            times: list[f32] = { 0 }
                            values: list[vec3] = { { 150, 0, 0 } }
                        }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {
                            constantValue: f32 = 1
                            dynamics: pointer = VfxAnimatedFloatVariableData {
                                probabilityTables: list[pointer] = {
                                    VfxProbabilityTableData {
                                        keyTimes: list[f32] = { 0, 1 }
                                        keyValues: list[f32] = { 0, 360 }
                                    }
                                }
                                times: list[f32] = { 0 }
                                values: list[f32] = { 1 }
                            }
                        }
                    }
                    emitRotationAxes: list[vec3] = { { 0, 1.0000001, 0 } }
                }
                EmitterPosition: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 10, 0 }
                }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_color-flame.tex"
                pass: i16 = 10
                isDirectionOriented: flag = true
                isRandomStartFrame: flag = true
                directionVelocityScale: f32 = 0.011
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 5, 3, 10 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.5, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.2, 1.2 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 5, 3, 10 } }
                    }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[vec3] = {
                            { 1.5, 1.5, 1.5 }
                            { 0, 0, 0 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/Base/Particles/Rumble_Sparks.tex"
                texDiv: vec2 = { 2, 2 }
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.15
                rate: embed = ValueFloat {
                    constantValue: f32 = 2
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 4.25
                }
                particleLinger: option[f32] = { 14.25 }
                lifetime: option[f32] = { 4.25 }
                isSingleParticle: flag = true
                emitterLinger: option[f32] = { 1 }
                emitterName: string = "teamcircle-green"
                disabled: bool = true
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_team_color_green.tex"
                blendMode: u8 = 1
                pass: i16 = 50
                colorLookUpScales: vec2 = { 0.4, 0.3 }
                colorLookUpOffsets: vec2 = { 0.3, 0 }
                colorRenderFlags: u8 = 1
                isLocalOrientation: flag = false
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 145, 1, 1 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Tar_Green_03.tex"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 2
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.25
                }
                particleLinger: option[f32] = { 10 }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "ground_nova_02_skin03"
                importance: u8 = 3
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, 3, 0 }
                }
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_alpha_12_e.tex"
                blendMode: u8 = 4
                meshRenderFlags: u8 = 0
                isUniformScale: flag = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { -90, 0, 0 }
                }
                isLocalOrientation: flag = false
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 240, 240, 240 }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                        }
                        times: list[f32] = { 0, 0.5, 1 }
                        values: list[vec3] = {
                            { 0.7, 0.7, 0.7 }
                            { 1, 1, 1 }
                            { 1.3, 1.3, 1.3 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin_03_E_blast_07.tex"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 30
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.7
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.5, 1 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[f32] = { 0.7 }
                    }
                }
                particleLinger: option[f32] = { 1.2 }
                lifetime: option[f32] = { 0.1 }
                isSingleParticle: flag = true
                fieldCollectionDefinition: pointer = VfxFieldCollectionDefinitionData {
                    fieldDragDefinitions: list[embed] = {
                        VfxFieldDragDefinitionData {
                            radius: embed = ValueFloat {
                                constantValue: f32 = 1000
                            }
                            strength: embed = ValueFloat {
                                constantValue: f32 = 0.8
                            }
                        }
                    }
                    fieldNoiseDefinitions: list[embed] = {
                        VfxFieldNoiseDefinitionData {
                            Position: embed = ValueVector3 {
                                constantValue: vec3 = { 0, 300, 0 }
                            }
                            radius: embed = ValueFloat {
                                constantValue: f32 = 500
                            }
                            frequency: embed = ValueFloat {
                                constantValue: f32 = 2
                            }
                            velocityDelta: embed = ValueFloat {
                                constantValue: f32 = 15
                            }
                            axisFraction: vec3 = { 1, 1, 1 }
                        }
                    }
                }
                emitterName: string = "Dust_skin03"
                birthVelocity: embed = ValueVector3 {
                    constantValue: vec3 = { 120, 80, 120 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 1 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 2 }
                            }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -1, 2 }
                            }
                        }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 120, 80, 120 } }
                    }
                }
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                    dynamics: pointer = VfxAnimatedFloatVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[f32] = { 0.5, -1.5 }
                    }
                }
                SpawnShape: pointer = VfxShapeLegacy {
                    emitOffset: embed = ValueVector3 {
                        constantValue: vec3 = { 120, 0, 0 }
                    }
                    emitRotationAngles: list[embed] = {
                        ValueFloat {
                            constantValue: f32 = 1
                            dynamics: pointer = VfxAnimatedFloatVariableData {
                                probabilityTables: list[pointer] = {
                                    VfxProbabilityTableData {
                                        keyTimes: list[f32] = { 0, 1 }
                                        keyValues: list[f32] = { 1, 360 }
                                    }
                                }
                                times: list[f32] = { 0 }
                                values: list[f32] = { 1 }
                            }
                        }
                    }
                    emitRotationAxes: list[vec3] = { { 0, 1.0000001, 0 } }
                }
                primitive: pointer = VfxPrimitiveArbitraryQuad { }
                particleColorTexture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_Smoke_RGBA.tex"
                blendMode: u8 = 1
                pass: i16 = 3
                meshRenderFlags: u8 = 0
                colorLookUpTypeY: u8 = 1
                isUniformScale: flag = true
                birthRotation0: embed = ValueVector3 {
                    constantValue: vec3 = { -90, 1, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0, 360 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { -90, 1, 0 } }
                    }
                }
                birthRotationalVelocity0: embed = ValueVector3 {
                    constantValue: vec3 = { 0, 20, 0 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { -1, 1 }
                            }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 0, 20, 0 } }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 50, 50, 50 }
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData {
                                keyTimes: list[f32] = { 0, 1 }
                                keyValues: list[f32] = { 0.8, 1.5 }
                            }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            }
                        times: list[f32] = { 0 }
                        values: list[vec3] = { { 50, 50, 50 } }
                    }
                }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        probabilityTables: list[pointer] = {
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                            VfxProbabilityTableData { }
                        }
                        times: list[f32] = { 0, 1 }
                        values: list[vec3] = {
                            { 0.3, 0.3, 0.3 }
                            { 1.8, 1.8, 1.8 }
                        }
                    }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_R_SmokeCloud.tex"
            }
            VfxEmitterDefinitionData {
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, 550 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_01.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_01.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_01.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                pass: i16 = -10
                meshRenderFlags: u8 = 0
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.1
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                importance: u8 = 3
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, 340 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_02.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_02.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_02.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                meshRenderFlags: u8 = 0
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.2
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                importance: u8 = 3
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, 130 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_03.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_03.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_03.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                meshRenderFlags: u8 = 0
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.3
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                importance: u8 = 3
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, -50 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_04.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_04.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_04.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                meshRenderFlags: u8 = 0
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.4
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                importance: u8 = 3
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, -250 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_05.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_05.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_05.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                meshRenderFlags: u8 = 0
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
            VfxEmitterDefinitionData {
                timeBeforeFirstEmission: f32 = 0.2
                rate: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 5
                }
                particleLinger: option[f32] = { }
                lifetime: option[f32] = { 1 }
                isSingleParticle: flag = true
                emitterName: string = "Crater_Mesh"
                importance: u8 = 3
                bindWeight: embed = ValueFloat {
                    constantValue: f32 = 1
                }
                SpawnShape: pointer = 0xee39916f {
                    emitOffset: vec3 = { 0, -10, -430 }
                }
                primitive: pointer = VfxPrimitiveMesh {
                    mMesh: embed = VfxMeshDefinitionData {
                        mMeshName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_06.skn"
                        mMeshSkeletonName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_06.skl"
                        mAnimationName: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_Skin03_ULT_Ground_06.anm"
                    }
                }
                blendMode: u8 = 1
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.7, 1 }
                        values: list[vec4] = {
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 1 }
                            { 1, 1, 1, 0 }
                        }
                    }
                }
                meshRenderFlags: u8 = 0
                alphaErosionDefinition: pointer = VfxAlphaErosionDefinitionData {
                    erosionDriveCurve: embed = ValueFloat {
                        dynamics: pointer = VfxAnimatedFloatVariableData {
                            times: list[f32] = { 0, 0.05382436, 0.9320113, 1 }
                            values: list[f32] = { 1, 0.0100334445, 0.0100334445, 1 }
                        }
                    }
                    erosionFeatherIn: f32 = 0.3
                    erosionFeatherOut: f32 = 0.3
                    erosionMapName: string = "ASSETS/Shared/Particles/Base_SmokeErode.tex"
                    erosionMapChannelMixer: embed = ValueColor {
                        constantValue: vec4 = { 1, 0, 0, 0 }
                    }
                }
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 1.5, 2, 2 }
                }
                texture: string = "ASSETS/Characters/Rumble/Skins/skin03/Particles/Rumble_R_Mesh_TX_CM.tex"
            }
        }
        particleName: string = "Rumble_Skin03_R_tar_team_green"
        particlePath: string = "Characters/Rumble/Skins/Skin3/Particles/Rumble_Skin03_R_tar_team_green"
        soundPersistentDefault: string = "Play_sfx_Rumble_RumbleREffect_hit"
        objectPath: hash = 0xa075fcc1
    }
`;

export const rumblePatch: SkinPatch = {
  champion: 'rumble',
  // 补丁里的粒子路径写死了 Skin3 命名空间，只套在验证过的 3 号皮肤上
  skins: [3],
  note: 'R 燃烧特效（常驻条件 + VfxSystemDefinitionData），来自 Rose 的 68003 手改包',
  propsInsert: [
    {
      after: 'skinParent',
      label: 'R 燃烧特效条件（ChromaData / PersistentEffectConditions）',
      text: R_PROPS_INSERT,
    },
  ],
  entriesInsert: [
    {
      label: 'R 燃烧粒子定义 0xa075fcc1（VfxSystemDefinitionData）',
      text: R_VFX_ENTRY,
    },
  ],
  /**
   * `Resources` 里三个映射（同一份包里逐条比对出来的，都是不透明 hash，没法从路径推）：
   * - `0x74ad149b`：R 的「燃烧」引用，游戏数据里指向 `Rumble_Skin03_r_burn`，那份包里改成
   *   指向新加的粒子定义 `0xa075fcc1`，不改的话上面那段粒子没人引用，等于白加；
   * - `0x97e29b7d` / `0x68ba7d5d`：就是 `PersistentEffectConditions` 里两个
   *   `PersistentVfxData.effectKey`，分别解析到 `Rumble_Skin03_Q_cas_01` / `_02` 的 hash
   *   （`0xe70b8192` / `0xe60b7fff`）。缺了它们，条件成立时挂不上任何粒子。
   */
  resourceMap: {
    label: 'R 燃烧特效的 3 条资源映射',
    set: {
      '0x74ad149b': '0xa075fcc1',
      '0x97e29b7d': '0xe70b8192',
      '0x68ba7d5d': '0xe60b7fff',
    },
    /**
     * 这两个 key 是**我们这边多出来的**（沿用自 base 皮肤那份 resolver）：它们也解析到
     * `Rumble_Skin03_Q_cas_01` / `_02`，游戏里表现为「Q 的火焰有两个方向」—— 同一段粒子
     * 被两套 key 各挂一次。手改包里没有这两条，删掉才对得上。
     */
    remove: ['0x52c319c0', '0x55c31e79'],
  },
};
