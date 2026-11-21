# 皮肤生成 / skinhack 检查 / 如何通过

这篇讲三件事：**皮肤是怎么生成出来的**、**怎么确认它被 LTK 判成了 skinhack**、
**我们的包靠什么通过 LTK 的 base-skin 检查**（以及哪些做法没用）。
第 8 节是附录：**这套判定逻辑是怎么从零挖出来的**、版本怎么对齐。

> 适用范围：本仓库当前代码（`electron/export/*`）+ 随包的 `native/tools`。
> LTK 的判定逻辑以 `ltk-manager-problems` 的
> `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs` 为准（本机有一份只读参考
> 在 `%TEMP%\ltk-src`，没入库）。
>
> 文中「过检查」指的是**让皮肤包符合 LTK 对 base 皮肤的规范**，不是对抗什么反作弊：
> 我们生成的就是一个正常的 mod 包，只是把身份（网格、名字、音频）改回 base 皮肤。

---

## 0. 一分钟版

```
游戏 WAD ──定向解包──> skin<n>.bin ──ritobin ──> .py
                                            │
                        改写 entry key / mResourceResolver
                        读 base 皮肤身份（名字 + 音频段）
                        音效别名（补 bank、改事件名）
                        网格重建 + championSkinName/skeleton/simpleSkin
                        音频身份换回 base
                                            │
                                          .bin
                                            │
                        LTK 名字检查（0.2 ms，不合格就拦）
                                            │
                                 wad-make → .wad.client → .zip
                                            │
                            <hero>_<n>.zip + <hero>_<n>.zip.check.json
```

一句话：**改内容（网格）再改名字（身份 + 音频），最后自己按 LTK 的规则验一遍**。

---

## 1. 怎么生成皮肤

### 1.1 前置条件

| 项 | 要求 | 配置键 / 位置 |
| --- | --- | --- |
| 游戏 | 装好的正式服客户端（读 `DATA\FINAL\Champions\*.wad.client`） | `GAME_PATH` |
| 工具 | 随安装包带的 `resources\tools`（`native/tools`），不完整会提示缺失 | `MOD_TOOLS_PATH` |
| 皮肤目录 | 生成结果放这里 | `SKIN_PATH` + `SKIN_DEFAULT_SUFFIX`（默认 `leagueSkins`，常见改成 `wad_skins`） |

工具清单（不用手动初始化）：`wad-make.exe`、`wad-extract.exe`、`mod-tools.exe`、
`ritobin\bin\ritobin-tools.exe`、`ritobin\bin\hashes\*`、`skinbins-index.txt`。
索引过期会报「不在皮肤索引里」，用 `npm run index:gen -- <hashes.game.txt>` 重新生成。

### 1.2 入口（界面）

| 按钮 | 位置 | 作用 |
| --- | --- | --- |
| **（一个）当前皮肤文件** | 皮肤选择面板 → 操作区 | 只生成当前选中的那个皮肤（`loadSkinDataByFilePath(wad, skinIndex)`） |
| **（多个）全部皮肤文件** | 同上 | 把这个英雄 WAD 里所有 `skin<n>.bin` 都生成一遍（`loadSkinDataByFilePath(wad)`，`current = -1`） |
| **使用皮肤** | 同上 | 注入到 LTK Manager 并记为「使用中」。右上角浮钮的「应用前先构建皮肤 zip」打开时，会先重建 zip 再注入 |

皮肤 id 是 `<英雄id><序号>`（如 Akali `84102` = hero 84、`skin102`），生成时要的是序号
`102`（`electron/export/skin-id.ts` 的 `toSkinIndex()` 负责换算）。

### 1.3 内部流水线（含日志对照）

`electron/export/load-skin-data.ts` 的 `loadSkinDataByFile()`：

| # | 干什么 | 代码 | 日志长什么样 |
| --- | --- | --- | --- |
| 1 | 解包：按 `skinbins-index.txt` 只取本 WAD 里的 `data/characters/<角色>/skins/skin*.bin`（几百 KB），查不到退回全量 | `doUnpackWadFile(targeted)` + `discoverWadSkinBins` | `[定向解包] 12/234 个皮肤 bin，用时 36 ms` |
| 2 | 批量转文本：一次 `ritobin-tools convert -r --ext py`（名字表用精简表） | `electron/export/ritobin.ts` | `[ritobin] 批量解包 12 个 bin，用时 69 ms（精简名字表）` |
| 3 | 改 entry key：`SkinCharacterDataProperties` 对象改成 `"Characters/<角色>/Skins/Skin0"`，`mResourceResolver` / `ResourceResolver` 指向 `.../Skin0/Resources` | `patchPyFile()` | `SkinCharacterDataProperties 替换 … -> …` |
| 4 | 读 base 皮肤身份：从游戏 `skin0.bin` 里读 `championSkinName` 和音频两段 | `readBaseSkinData()` | `[base-skin] akali 的 base 皮肤: Akali，音频段 已读到` |
| 5 | 音效别名：改单位名/事件名，往皮肤事件 bank 里补 base 名字的别名 Event，语音补 sidecar bank | `electron/export/skin-banks.ts` | `音效别名 94 个，语音别名 62 个（…），单位 Akali_Skin102_SFX->Akali_Base_SFX，随包 bank 2 个` |
| 6 | 网格重建 + 身份改名 | `skin-rebase.ts` + `skin-mesh.ts` | `ASSETS/…/Skin102/Akali_Skin102.skn -> assets/characters/akali/skins/base/akali.skn (null vertex，2491860 字节)` |
| 7 | 动画图：把皮肤自己那份 `animations/skin<n>.bin` 改名成 Skin0 放进包，链接一起改 | `skin-animation.ts` | `[动画图] akali: DATA/Characters/Akali/Animations/Skin102.bin -> data/characters/akali/animations/skin0.bin（… -> …/Skin0，改写 animationGraphData + linked）` |
| 8 | 转回 bin | `pyToBinsCall()` | `[封包完成 ritobin]` |
| 9 | **LTK 名字检查** | `electron/export/skin-check.ts` | `[检查] 84_102 通过 LTK 名字检查` 或 `[检查] … 会被 LTK 判 skinhack（9 处）：…` |
| 10 | 打 WAD | `wad-make.exe` | `[正在封包] 生成 WAD` + `[INF] Packing / Reading / Writing / Done!` |
| 11 | 打 zip（`META/info.json` + `WAD/<英雄>.wad.client`） | `createZipFile()` | `[ZIP完成] 84_102.zip` |
| 12 | 写检查结果 sidecar | `writeSkinCheck()` | 文件 `<zip>.check.json` |

### 1.4 产物

```
%LOCALAPPDATA%\lol-skin-ll\skins\<SKIN_DEFAULT_SUFFIX>\<heroId>\
  ├─ 84_102.zip               ← 交给 LTK Manager 的 mod 包
  └─ 84_102.zip.check.json    ← 生成时的 LTK 名字检查结果 { ok, champion, checkedAt, problems, builder }
```

> `.check.json` 里的 `builder` 是包内容版本（`SKIN_ARCHIVE_BUILDER`）。跟当前版本不一致的老包
> （比如还没带动画图的那批）会被 `checkHasSkins()` / `autoBuildSkin()` 当成「没有」，重新生成一次；
> 没有 `.check.json` 的包（手动放进来的）不动。

zip 里面只有两样东西：

```
META/info.json                 { Author, Description, Name: "84_102", Version }
WAD/Akali.wad.client           ← wad-make 打包，chunk 是下面的文件
   data/characters/akali/skins/skin0.bin                     皮肤数据（已改写）
   data/characters/akali/animations/skin0.bin                皮肤自己的动画图（改成 Skin0，见 §4.7）
   assets/characters/akali/skins/base/akali.skn|.skl          重建过的网格/骨架
   assets/sounds/…/sfx/…/akali_skin102_sfx_events.bnk         改过的皮肤事件 bank
   assets/sounds/…/sfx/…/base/akali_base_sfx_events.bnk       让位过的 base 事件 bank
   assets/sounds/…/vo/…/akali_skin102_vo_basetag_events.bnk   语音别名 sidecar
```

> `animations/skin0.bin` 只有「皮肤的 bin 链接到别的皮肤动画图」时才有（`data/characters/<角色>/skins/skin0.bin`
> 里 `animationGraphData` 指向非 Skin0，见 §4.7）；本来就指 Skin0 的皮肤不会多这个文件。

> 多角色皮肤（如 `JarvanIV.wad.client` 里有 `jarvaniv`、`jade_jarvaniv`、
> `jarvanivstandard`…）每个角色各一份 `data/characters/<角色>/skins/skin0.bin`，
> 网格/音频都各自改写。LTK 只会检查与 WAD 同名的那个角色（见 §3.1）。

### 1.5 耗时（本机实测，SSD）

| 阶段 | 典型耗时 |
| --- | --- |
| 定向解包（12 个 bin） | ~36 ms |
| ritobin 批量转文本（12 个 bin） | 70–370 ms（冷启动一次，含读精简名字表） |
| 改写（文本 + bank + 网格） | 10–100 ms |
| LTK 名字检查（5 MB 文本） | ~0.2 ms |
| wad-make + 压缩 | 100–300 ms |
| **单个皮肤合计** | **0.5–1.5 s**（皮肤越大越慢） |

---

## 2. 怎么确认皮肤被判成 skinhack

### 2.1 现象

- 进游戏**没有换肤**，LTK Manager 里这个 mod 被标成 rejected / overlay 被关；
- 同一次注入里其它皮肤可能正常（每个 WAD 单独扫）；
- 有时注入当场就报错，有时要等游戏里加载（`phase: loading`）才判。

### 2.2 LTK Manager 的日志（最直接）

```
%APPDATA%\dev.leaguetoolkit.manager\logs\ltk-manager.<日期>.log
```

PowerShell 里直接看这次注入的关键行：

```powershell
$log = "$env:APPDATA\dev.leaguetoolkit.manager\logs\ltk-manager.$((Get-Date).ToString('yyyy-MM-dd')).log"
Select-String $log -Pattern 'base-skin check|scan failed|overlay verification|c0000229|Skinhack' |
  Select-Object -Last 20 | ForEach-Object { $_.Line }
```

会看到这样一组（这就是 84_102 的原始现场）：

```
… INFO  ltk_manager_runtime::patcher::injector: [ltk-dll pid=13728 tid=7644 WARN] ltk_patcher_dll::verify::ah: base-skin check: skin database for akali is from another game version
… INFO  ltk_manager_runtime::patcher::injector: [ltk-dll pid=13728 tid=7644 ERROR] ltk_patcher_dll::verify: WAD scan failed status with c0000229 for akali.wad.client
… INFO  ltk_manager_runtime::patcher::injector: [ltk-dll pid=13728 tid=7644 ERROR] ltk_patcher_dll::verify: overlay verification failed, disabling overlay: wad data/final/champions/akali.wad.client: base-skin check: skin0 is another skin: SkinAudioProperties.BankUnits.Events names akaliSkin<n>
… WARN  ltk_manager_runtime::patcher::injector: Integrity scan rejected 1 archive(s); stopping patcher
… INFO  ltk_manager_core::patching::pipeline: Incident recorded: Skinhack Detection id=2026-11-19T22-26-23 verdict=SkinhackDetected
```

| 关键字 | 含义 |
| --- | --- |
| `base-skin check: skin0 is another skin: <哪一项>` | 判定原因，后面会跟 `SkinMeshProperties.Skeleton` / `ChampionSkinName` / `TagEventList` / `BankUnits.Name` / `BankUnits.Events` |
| `names akaliSkin<n>` | 命中的规则：名字里出现了 `<英雄>skin<n>`（n≠0） |
| `WAD scan failed status with c0000229` | 状态码 `0xC0000229` = skinhack 拒绝 |
| `overlay verification failed, disabling overlay` | 结果：**整个 overlay 被关**（不是只关这一个皮肤） |
| `Integrity scan rejected N archive(s)` | 本次注入里有几个 WAD 被拒 |

> `skin database ... is from another game version` 是另一回事（LTK 自己的皮肤数据库版本旧了），
> 只是 WARN，不影响这个包。

### 2.3 事故记录 JSON（结构化、最好存档）

```
%APPDATA%\dev.leaguetoolkit.manager\incidents\<时间戳>.json
```

关键字段：

| 字段 | 值（被拒时） | 说明 |
| --- | --- | --- |
| `verdict.kind` | `skinhack-detected` | 判定类型 |
| `verdict.consequence` | `overlay-off` | 后果 |
| `scanStatus` / `scanStatusCode` | `skinhack` / `c0000229` | 扫描结果 |
| `overlayDetail` | `akali.wad.client: base-skin check: skin0 is another skin: …` | **具体原因** |
| `suspects[]` | `{ displayName: "84_102", because: "writes Akali.wad.client, which the scan rejected", reason: "rejected" }` | 认定是哪个 mod 干的 |
| `evidence[]` | `scan rejected akali.wad.client, status c0000229` 等 | 时间线 |

`%LOCALAPPDATA%\lol-skin-ll\logs\ltk\ltk_launcher.log` 只有注入/拉起过程，**没有**判定原因，
排查先看上面两个。

### 2.4 程序自己这边的证据

1. 构建日志里的检查行：

   ```
   [检查] 84_102 通过 LTK 名字检查
   [检查] 84_102 会被 LTK 判 skinhack（9 处）：Play_AkaliSkin102_Attack1_To_Idle、…
   ```

2. `%LOCALAPPDATA%\lol-skin-ll\skins\…\<hero>_<n>.zip.check.json`：

   ```json
   {
     "ok": false,
     "champion": "Akali",
     "checkedAt": "2026-11-19T14:48:55.573Z",
     "problems": [{ "kind": "event", "value": "Play_AkaliSkin102_Attack1_To_Idle" }]
   }
   ```

3. **注入前的拦截**：`injectSkin()`（`electron/export/index.ts`）读这个 sidecar，
   `ok=false` 就**不注入**，弹「会被 LTK 判 skinhack（…），已停止加载，请换一个皮肤或重新生成」；
   「加载全部皮肤」会跳过它并提示跳过了几个。老包没有 sidecar 就不拦（照旧尝试）。

### 2.5 离线自查

```powershell
# 规则本身（不需要游戏、不需要生成）：LTK 名字规则 + 音频别名规划
npm run skincheck:test
npm run banks:test

# 已经生成过的包：直接看生成时写下的检查结果
Get-Content "$env:LOCALAPPDATA\lol-skin-ll\skins\wad_skins\84\84_102.zip.check.json" -Raw
```

想自己扫一个**别人做的包**（没有 sidecar）时：

1. 解开 zip，拿到 `WAD/<英雄>.wad.client`；
2. 用随包的 `wad-extract.exe <wad> <输出目录> <hashes.game.txt>` 解出里面的 chunk
   （`hashes.game.txt` 是 cslol-tools 包里那份 219 MB 的名字表，我们没有随包带；
   不给它时文件会按 chunk 哈希命名，这时找文件头是 `PROP` 的那个就是皮肤 bin）；
3. 用 `ritobin-tools convert <skin0.bin> --ext rito` 转成文本，看这几个地方：

   ```powershell
   $rito = '.\skin0.rito'

   # a) 皮肤自己的名字
   Select-String $rito -Pattern 'championSkinName: string'

   # b) 音频 tag 链
   Select-String $rito -Pattern 'tagEventList: list\[string\]'

   # c) 音频单位名（<英雄>_Skin<n>_SFX）
   Select-String $rito -Pattern 'name: string = "[A-Za-z0-9_]*Skin[1-9]\d*_SFX"'

   # d) 事件名（以动作前缀开头的那些）
   Select-String $rito -Pattern '"(Play|Stop|Switch|Set|Pause|Resume|Mute|Unmute|Seek)_[A-Za-z0-9_]*Skin[1-9]\d*' |
     ForEach-Object { $_.Line.Trim() }
   ```

   d) 出来的只是**候选**，要逐条对照 §3.3：别的英雄的名字（如 `EvelynnSkin65`）、
   voiceOver 单位的事件、不在 `BankUnits[].events` 里的引用（比如 VFX 参数里的字符串）
   都不算；`bankPath` 里的路径不算；base 皮肤自己也列的事件不算。

   最权威的依据还是 LTK 的 `incidents\*.json`（§2.3）和生成时写的 `.check.json`（§2.4）。

> 本机开发时还有一份「离线复刻 patcher 检查（网格 + 名字）」的脚本
> `%TEMP%\harness\check-ltk.mjs`，需要先把生成的 WAD 解开成目录；那是开发机临时脚本，不在仓库里。

### 2.6 排查决策树

```
进游戏没换肤
├─ LTK 日志里没有 c0000229 / skinhack
│   ├─ mod 一启动就被禁用、提示 "Skinhack excluded" → 作者/描述黑名单（§2.7）
│   ├─ 有 "MANAGER_ELEVATED" / 桥没起来 → 注入链路问题（见 HOW-IT-WORKS §8）
│   └─ 有 "skin database ... another game version" → LTK 数据库旧，只是 WARN
└─ 有 c0000229 / skinhack
    ├─ overlayDetail 里是 SkinMeshProperties.* → 网格问题（§4.1）
    ├─ 是 ChampionSkinName / TagEventList / BankUnits.Name → 身份名字没换干净（§4.2–4.3）
    └─ 是 BankUnits.Events names `<英雄>Skin<n>` → 事件名漏改（§4.4，注意状态类写法）
```

先看 sidecar：有 `check.json` 且 `ok=false` 就是名字类问题；`ok=true` 却还被拒，多半是网格
（名字检查不查网格）。

### 2.7 另一种「没挂上」：作者/描述黑名单（和内容无关）

LTK Manager 启动 patcher 前还有一层**按 mod 元数据**的拦截
（`src/modules/library/utils/skinhackCheck.ts`）：作者名命中 `rose`、`darkseal.org`，
或描述里出现 `https://github.com/alban1911/rose` 的 mod，会被**强制禁用**并提示
「Skinhack excluded」（`patcher_skinhack_excluded_title`），日志里**不会**有 `c0000229`。

- 现象：mod 明明在库里，但一启动就被关掉，LTK 日志干净；
- 查法：看这个 mod 的 `META/info.json` 里 `Author` / `Description`；
  或看 Manager 日志里的 `Skinhack excluded` toast 相关行；
- 我们生成的包作者是 `lzf`、描述是 `xxxx`，不会命中；导入别人的包时要注意。

---

## 3. LTK 到底怎么判（规则原文）

> 本节规则对应本机 2026-11-20 的 **`ltk_patcher-32`**（LTK Manager 1.33.0，
> commit `071dc2dd`）。怎么确认版本、怎么把源码和 DLL 里的证据挖出来，见 §8。

判定入口：`crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs` 的 `evidence_in()`。

### 3.1 检查范围

- 只看 mod 里 `WAD/<c>.wad.client` 内的 `data/characters/<c>/skins/skin0.bin`，
  即 `<c>` 必须与 WAD 名一致（`champion_of()`，大小写不敏感）；
- 其它角色目录（`jade_*` 等）**不检查**；
- 这个 bin 与游戏里同一路径的 bin **逐字节相同**时直接通过（没改过 = 没嫌疑）；
- 里面必须能解析出 `Characters/<c>/Skins/Skin0` 这个对象，且类是
  `SkinCharacterDataProperties`，否则不判（也不报错）。

### 3.2 网格（`SkinMeshProperties`）

对 `skeleton`（`.skl`）和 `simpleSkin`（`.skn`）两个 slot：

1. 先和**游戏 base 皮肤**的对应文件比：**完全相同**（大小 + SHA-256）就算过 —— 注意两个 slot
   里只要**有一个**跟 base 相同，整个检查就直接通过（不再看另一个）；
2. 否则拿去和游戏里**同英雄其它皮肤**的网格比：只要我们的文件**前 N 字节**（N = 对方大小）
   与对方相同 → 判「用了别的皮肤的网格」。

包的这一层没有这个文件时，按「游戏里同一路径的文件」算 —— 所以如果 bin 直接指向别的皮肤
的网格路径而包里又不带它，等于用了别人的网格，同样命中。

注意两点：

- 规则 2 是**前缀比较，追加的尾巴不算**：所以往末尾补 16 个 0 字节**没有用**；
- 骨架还有个特例：zeros 填充过的 `.skl`（头里的 size 字段等于填充后的长度）会被「去填充」
  后再比一次 —— 也就是说补零/补齐长度同样躲不过。

### 3.3 名字（`other_skin_names`）

命中的定义（`names_other_skin()`）：名字里出现 **`<英雄>skin<数字>`**，数字 ≠ 0，
大小写不敏感；单位名用的是 **`<英雄>_skin<数字>` + `_sfx`**。检查这四类：

| 位置 | 用哪个 marker | 说明 |
| --- | --- | --- |
| `ChampionSkinName` | `<英雄>skin` | 皮肤自己的名字，例如 `AkaliSkin102` |
| `SkinAudioProperties.TagEventList[]` | `<英雄>skin` | 音频 tag 链 |
| `SkinAudioProperties.BankUnits[].Name` | `<英雄>_skin` + `_sfx` | 例如 `Akali_Skin102_SFX` |
| 非 voiceOver 单位的 `events[]` | `<英雄>skin` | 事件名，例如 `Play_sfx_AkaliSkin102_Idle1` |

几个容易忽略的细节：

- **`stock` 例外**：base 皮肤自己也会列的事件不算（有的 base 皮肤就列着别的皮肤的事件，
  例如 `Play_sfx_SylasSkin01_Recall_cast`）。判断 `stock` 用的是游戏 `skin0.bin` 里
  **所有单元**的事件并集。
- **voiceOver 单位的事件不查**（语音事件本来就会提到别的皮肤名，比如
  `FirstEncounter3DEvelynnSkin65`）。
- 单位名命中后，**不再看这个单位的 events**。
- 匹配是**子串**，不是分段：`Play_AkaliSkin102_Attack1_To_Idle`（tag 在第二段）和
  `Play_sfx_AkaliSkin102_Idle1`（tag 在第三段）都会命中；`sona_skin77`（中间有下划线）
  **不会**命中 `sonaskin`，`AkaliSkin0`（序号 0）也不会命中。
- `bankPath` 里的路径（`…/Skins/Skin102/…`）**不参与**检查。

### 3.4 结果

- 网格命中 → 只报网格（`Evidence::Mesh`）；
- 否则把所有名字命中一起报（`Evidence::Audio`）；
- patcher 侧最终状态码 `0xC0000229`，后果是整个 overlay 关闭。

---

## 4. 我们的包靠什么通过

对应 §3 的两道门：**网格内容**、**名字**。任何一道没过都会被拒，所以两步都要做。

### 4.1 网格：重建，而不是补字节

`electron/export/skin-mesh.ts` 的 `prepareMeshFile()`（照 Rose 1.5.9 的 `mesh.py`）：

- **骨架 `.skl`**：末尾加一根没人用的根部关节 `null_bone`（原点、单位绑定姿势、没有动画轨道），
  按名称哈希排进查找表，其余关节下标和动画轨道不变；
- **网格 `.skn`**：末尾加一个「最后一个顶点的拷贝」，只加在顶点缓冲和最后一个 submesh 的
  range 末尾，索引缓冲不动 —— 没有三角形用它，模型看起来一模一样；
- 先削掉老实现补的 16 个 0 字节，再重建；`isRebuilt()` 保证重建过的文件不重复加。

这样文件内容与游戏里任何一张皮肤都不同（§3.2 的「完全相同」和「前缀相同」都不成立），
模型和动画却不变。**这就是“过网格检查”的全部手段，不要尝试别的取巧**（补 0、改后缀、
直接拷 base 文件——拷 base 文件其实也能过，但就没有皮肤自己的模型了）。

### 4.2 身份名

`electron/export/skin-rebase.ts` 的 `rebaseSkinPy()`：

- `championSkinName` → 该英雄 **base 皮肤**的名字（从游戏 `skin0.bin` 读，例如 `Akali`、
  `Jade_JarvanIV`，不能靠拼字符串猜）；
- **保留 `championSkinId`**：游戏自带的 base `skin0.bin` 里本来就有（Sona 是 `37000`），
  Rose 的 rebase 也不删。多形态皮肤（`skinUpgradeData` 的 gear form）和音频靠它绑定
  「哪个皮肤」，删掉会让游戏把这份数据当成没有皮肤身份的数据；
- `skeleton` / `simpleSkin` → 指到重建后的 base 路径。**路径字符串照抄**游戏 base
  `skin0.bin` 里的原写法（`ASSETS/Characters/MissFortune/Skins/Base/MissFortune.skl`）——
  不能拿目录名拼（`missfortune` 拼出来是 `Missfortune`，大小写和游戏不一致）；
- entry key 改成 `"Characters/<角色>/Skins/Skin0"`（`patchPyFile()`，另含
  `mResourceResolver` / `ResourceResolver` 指向 `.../Skin0/Resources`）；
- **`objectPath` 也改成 `"Characters/<角色>/Skins/Skin0"`**（`rebaseSkinObjectPath()`）：
  这条 entry 自己的身份路径，游戏自带 base `skin0.bin` 里就是 Skin0，Rose 的 21069 包也改了；
- **去掉目标不在本包里的 `skinUpgradeData`**（`dropDanglingSkinUpgrade()`）：
  `mGearSkinUpgrades` 指向 gear 对象（`.../Skins/Skin<n>/Gear/<名>`）。一部分皮肤的 gear 对象
  在「多皮肤」bin 里、不随皮肤包走；换成 base 皮肤后 gear 系统也没意义。Rose 的 21069 包
  把整段去掉了（我们留着时游戏里走路/技能都不播动画），目标在本包里的皮肤（例如 MF 21016、
  Lux 99007）保持原样；
- **补回 gear 的 submesh**（`unhideSubmeshes()`，`load-skin-data.ts` 的 `revealGearSubmeshes()`）：
  `initialSubmeshToHide` 把 A/B/C 三套枪全藏起来、靠 gear 系统按档位显示；去掉 gear 数据后
  没人显示它们，模型上就少两把枪。按皮肤 bin 的 `linked` 清单去游戏 WAD 里找到 gear 对象，
  读它的 `mCharacterSubmeshesToShow`（MF 21069 是 `A_Gun25 A_Gun25_Gem`），把这几个名字
  从 `initialSubmeshToHide` 里删掉 —— 结果和 Rose 的包逐字一致；
- **补回 gear 的特效映射**（`applyGearVfxMap()`，同一个 `revealGearSubmeshes()`）：
  皮肤 `Resources.resourceMap` 里 `MissFortune_W_Buf_LWeapon` / `W_Max` / `P_Buff` 这些 key
  是 `0x0`，平时靠 gear 的 `mVFXResourceResolver` 补 —— 去掉 gear 后 W 的枪口特效就没了。
  把 gear 的 `resourceMap` 补进皮肤的 `Resources`：key 按哈希对，value 是哈希时用粒子的
  `particlePath` 反查路径；key 名和皮肤里不一致的，再从粒子路径反推名字
  （`.../MissFortune_Skin69_W_Buf_LWeapon00` → `MissFortune_W_Buf_LWeapon`）再按哈希匹配；
- **炫彩（chroma）按独立皮肤的身份写**（`normalizeChromaClassification()`）：
  源皮肤带 `skinParent`（父皮肤 id）、`skinClassification = 2` 的就是炫彩 —— 它的数据本来是
  给游戏「和父皮肤一起加载」用的。塞进 base 槽位后父皮肤不在，游戏仍按炫彩处理，实测
  68_9（68009，父皮肤 68004）模型和走路都对，但 Q 的火焰歪、E 的火箭看不到、R 没特效：
  Rumble 的技能特效是动画图里的 `mEffectKey` 事件经皮肤 `Resources.resourceMap` 解析成粒子
  （`Characters/Rumble/Skins/Skin4/Particles/...`）的，炫彩身份下这条链拿不到父皮肤上下文。
  处理：把 `skinClassification` 换成 base 皮肤的值（独立皮肤都是 1），`skinParent` 留着
  （Rose 的包也留着）；不是炫彩的皮肤一个字节都不动 —— 传说/终极皮肤的分类不能被抹平。

> 这三条（骨架引用照抄、`objectPath`、`skinUpgradeData`）就是「我们的 21_69 走路没动画、
> Rose 的包正常」的全部差别 —— 网格文件逐字节相同、皮肤 bin 其余字段一致。

### 4.2.1 base-slot 外壳（builder 7）

`electron/export/skin-base-slot.ts`。规则来自 **Rose 的 `skins/68/68003/68003.fantome`**
（那份包在游戏里 Q/E/R 都正常），逐条对照后固化成数据驱动的处理，不按英雄特判：

1. **base 的 bin 只留身份对象 + `Resources`**（`stripInlineEntries()`）。builder ≤ 6 把皮肤
   自带的几十条粒子内嵌进 `skins/skin0.bin`，实测 Gnar/Rumble 这类「皮肤自带粒子 + 自带
   动画图」的皮肤会整条特效解析链对不上：Q 火焰落点歪、E 火箭和 R 特效不出现。
2. **`objectPath` 留在原皮肤命名空间**（不再改写成 `Skin0`）、补 `skinParent = 0`、
   去掉 `championSkinId`（`ensureSkinParent()` / `dropChampionSkinId()`）。
3. **`linked` 并上 base 皮肤 `skin0.bin` 的清单**（`mergeLinkedBins()`）。base 的清单里有
   皮肤 bin 没列的多皮肤 bin，`Resources` 里指向 `Skins/Skin0/Particles/...` 的那些 key
   就定义在里面（Rumble 的 `Rumble_Base_E_mis`、`Rumble_Base_R_cas_rocket`）。少了它们
   这些 key 指向的粒子在游戏里根本不存在。
4. **皮肤自己的 bin 整份随包**（覆盖同路径），并把 `keywordsRequired` 里等于原皮肤名的
   闸门删掉（`dropSkinKeywordGates()`）：

   ```
   Filtering: pointer = VfxEmitterFiltering {
       keywordsRequired: list[string] = { "RumbleSkin03" }   ← 删掉整块
   }
   Filtering: pointer = VfxEmitterFiltering {
       keywordsExcluded: list[string] = { "RumbleSkin03" }   ← 必须原样保留
   }
   ```

   过滤器匹配的是「皮肤 tag / 皮肤名」（原版 68003 的 `tagEventList` 里就有 `RumbleSkin03`），
   base-slot 的身份拿不到原皮肤的 tag，不删的话 E 的火箭、推进器、Q/R 命中这些 emitter
   一个都不渲染；而 `keywordsExcluded` 是「这个皮肤不要渲染」，删掉会让 base 皮肤的光晕
   一直挂在脚下（Rumble 的 `P_buf` 就是）。
5. **`idleParticlesEffects` 里挂点骨头不存在的条目删掉**（`dropIdleEffectsWithoutJoints()`，
   骨架关节名由 `skin-mesh.ts` 的 `readSkeletonJointNames()` 读出）。这些特效写死了
   `Pipe` / `Rocket` / `Spike` / `robot_root` 这类骨头，皮肤骨架里没有时游戏把它们塌到
   模型原点 —— Rumble 那团「脚下一只闪电」就是 `Idle_taze_01`（`Spike`）和
   `Idle_shortcircuit_01`（`robot_root`）。

日志：`[base-slot] … 皮肤自己的 bin 随包 skinN.bin（删掉 N 处皮肤名 VFX 闸门）` /
`bin 只留 … 、linked 补 N 条、去掉 championSkinId、补 skinParent=0、删 N 条 idle 特效`。

> 顺带：builder 7 起皮肤 bin 的文本转换优先用**随包完整名字表**
> （`native/tools/ritobin/bin/hashes`）。精简表里没有 `idleParticlesEffects` /
> `keywordsRequired` / `Filtering` 这些字段名，读出来全是 `0x…`，上面几步就没法按名字改
> （耗时同量级：191KB 的 bin 约 110ms）。

### 4.2.2 英雄专属补丁层（builder 8）

`electron/export/skin-patch.ts` + `electron/export/skin-patches/`。

base-slot 外壳是**通用规则**，能重建的东西全靠数据推导；但有一类特效数据在游戏数据里
**根本不存在**，规则推导不出来 —— 手改包是把整段定义搬进包里才跑通的。这一层就是给这种
英雄留的可选补丁，主流程不按英雄特判：

- **没登记补丁的英雄 → 什么都不做**（`findSkinPatch()` 返回 `null`），走纯数据流程，
  包内容和 builder 7 完全一样；
- **登记了补丁的英雄 → 在 base-slot 外壳改写完之后**，把补丁里的数据块插进 bin 的文本。

补丁只做三类插入，不改任何已有字段：

| 操作 | 位置 | 典型用途 |
| --- | --- | --- |
| `propsInsert` | `SkinCharacterDataProperties` 里，锚在某个字段之后（`after: 'skinParent'`） | `ChromaData`、`PersistentEffectConditions` |
| `entriesInsert` | 顶层 `entries` 表末尾 | 数据块**不在这里再抄一遍**时才用（见下） |
| `resourceMap.set` | `Resources.resourceMap` 里（有就覆盖值，没有就追加） | 补齐 `PersistentVfxData.effectKey`、把某个引用指到条目 |
| `resourceMap.remove` | 同上，删掉指定的 key | 同一个粒子被两套 key 各解析一遍 → 渲染两遍（Rumble 的 Q 两个方向火焰） |

细节：

- 片段按「最小缩进对齐目标层级」重新缩进（props 8 空格、entries 4 空格），补丁文件里
  从任意缩进写都行；插入前校验花括号配平，配不平直接抛错，不出半残的包；
- 幂等：片段首行已存在就跳过，同一个包重复构建不会插第二遍；
- `skins: [3]` 可以只对某几个皮肤序号生效（不填 = 该英雄所有皮肤）。补丁里的粒子路径
  经常写死原皮肤的命名空间（`Skins/Skin3/Particles/…`），没验证过的皮肤不要跟着套；
- 日志：`[base-slot] … 套用 rumble 专属补丁 2 块（…）`。

**不再手抄数据块**（builder 8 之后的两条通用能力，`skin-base-slot.ts`）：

1. `copyResolvedEntries()`：补丁的 `resourceMap.set` 把某个引用指到一个**条目 key** 时，
   生成时会按这个 hash 从随包的皮肤 bin 里把条目本体取出来放进 base bin（props 的
   `mResourceResolver` 只认自己这个 bin 的条目）。只搬点名的，不做「凡是能对上就搬」——
   Rumble 的 resolver 有 50 个 value 能对上皮肤 bin 的条目，全搬等于把整份粒子内嵌回
   base bin，正是 builder 7 验证过会破坏特效链的老做法。
2. `findUnresolvedResourceRefs()`：生成后扫 `Resources` 的 value，凡是「本 bin 没有、但随包
   其它 bin 有同名条目」的，日志会打
   `[base-slot] … Resources 有 N 个 value 指向本包其它 bin 的条目（…），props 解析不到`。
   这是「靠一份能跑的包来对照」的替代品：缺层会在日志里直接现形（Rumble 现在报 46 个，
   大部分是皮肤 bin 自带、props 本来就不该解析到的系统）。
3. `composeEmitters()`：游戏常把同一个技能特效拆成多个系统，而 base-slot 的条件一次只能
   挂一个系统。补丁写 `composeEntries: [{ key: '0xa075fcc1', alsoByName: '…_R_Crater_' }]`，
   生成时按名字前缀把伴随系统的 `VfxEmitterDefinitionData` 并进主系统 —— emitter 本体
   仍然全部来自游戏数据。Rumble 的 R 地面就是这样：`tar_team_green`（13 个 emitter）+
   6 个 `…_R_Crater_01..06`（各 1 个），并完与能跑的包**逐字节相同**（19 个 emitter、
   1,474 行）。只挂 tar 的话游戏里 R 完全看不见（实测）。

现有的补丁只有 Rumble（`skin-patches/rumble.ts`），只剩**两条映射 + 一段条件**：

- **条件**（游戏数据里确实没有）：把 Rumble 的 52 个 bin 全转成文本扫过，
  `PersistentEffectConditions` / `PersistentVfxData` **0 命中**，`0x97e29b7d` /
  `0x68ba7d5d` 也不在任何 bin 里。所以 `propsInsert` 补 100 行：三段 buff 条件 +
  `PersistentVfxData`，挂点 `R_Flame` 来自皮肤骨架，buff 名 `RumbleFlameThrower` /
  `RumbleDangerZoneBuff` / `RumbleOverheat` 都是游戏数据里的真实字段。
- **映射**：`0x74ad149b → 0xa075fcc1`（R 的燃烧引用，游戏里指向 5 行的 `r_burn` 存根，
  要指到 `Rumble_Skin03_R_tar_team_green`）+ 两个 `effectKey → Q_cas_01/_02`；
  `resourceMap.remove` 删掉 base 皮肤 resolver 里指向同一对粒子的两条（否则 Q 两个方向）。
- 上面三个 value 都是**条目 key**，所以 `copyResolvedEntries()` 会把系统本体从随包的皮肤
  bin 里搬进 base bin（各 1,206 / 580 / 430 行，都是**游戏自己的数据**）。补丁里一行粒子
  定义都没有：之前照着 Rose 的包手抄的那 1,471 行已经删掉了。

实测结论（游戏内）：条件不补 → R 完全没有；映射不指 → R 也没有（解析到 5 行的存根）；
三条都补 + 自动搬条目 → Q 单方向、E 火箭、R 燃烧都正常。

### 4.3 音频身份

`electron/export/skin-banks.ts` 的 `planBankAliases()`：

- `TagEventList` → 整段换成 base 皮肤的；
- `BankUnits[].Name`：`<英雄>_Skin<n>_SFX` → `<英雄>_Base_SFX`，`<英雄>_Skin<n>_VO` → `<英雄>_Base_VO`；
- **事件名换回 base tag** 的同时，在皮肤自己的事件 bank（`<英雄>_Skin<n>_SFX_events.bnk`）里
  为每个改名事件补一个 **base 名字的别名 Event**，指向原来的 Action —— 这样游戏按 base 名字
  找事件时声音还在（皮肤专属音效得以保留）；
- base 皮肤自己的事件 bank 里如果定义了同 id 的 Event，**删掉让位**（两个加载中的 bank 定义
  同一个 id，客户端只会留一个），改过的 base bank 随包一起走；
- 读不到 bank（比如皮肤没有事件 bank）时，这些事件**干脆不再列出来** —— 列出来就是给 patcher 抓。

### 4.4 两种事件名写法都要换

这是 84_102 被拒的直接原因，单独强调：

```
Play_sfx_AkaliSkin102_Idle1            ← tag 在第三段（<Action>_<分类>_<tag>_…）
Play_AkaliSkin102_Attack1_To_Idle      ← 状态类，tag 在第二段（Play_<tag>_<状态>）
Switch_AkaliSkin102_Footsteps_Brush    ← 同上
```

老代码按「第二个下划线之后」取 tag，状态类会取成 `Attack1`，跟 `TagEventList` 里的
`AkaliSkin102` 对不上，于是被漏掉。现在用 `otherSkinSegment(name, champion)` **按段**找
`<英雄>skin<n>` 标记，命中就把那一段换成 base tag，再走别名流程
（见 `skin-banks.ts`，测试在 `test/skin-banks.test.mjs`）。

### 4.5 语音：不能改语言 WAD，就加 sidecar

语音 bank 在**语言 WAD** 里（`<英雄>.zh_CN.wad.client`，路径带 `VO/en_US/`），mod 装不全所有
语言，所以不能改它。做法（`flushSidecars()`）：

- 建一个**语言无关**的 sidecar bank：`.../VO/.../Akali_Skin102_VO_basetag_events.bnk`
  （路径去掉语言目录，随英雄 WAD 走）；
- 里面放 base 名字的别名 Event，并把源事件的 **Action 对象复制进去**（Event 不能指向别的
  bank 的 Action）；
- bin 里语音单位的 `bankPath` 追加这个 sidecar；
- 同一份皮肤的几个角色（`vayne` / `jade_vayne`）共用一个 sidecar，别名累计
  （`createSidecarRegistry()`）。

### 4.6 哪些东西**不**参与检查（别做无用功）

| 东西 | 说明 |
| --- | --- |
| `bankPath` 里的路径 | 路径不在检查范围，`…/Skins/Skin102/…` 留着没关系 |
| entry key / `mResourceResolver` 指向的字符串 | 检查要求「能解析到 `Characters/<c>/Skins/Skin0` 这个对象」，解析不到就直接跳过检查；但游戏也按这个 key 取皮肤数据，所以必须改成 `Skin0`（我们顺便把 `mResourceResolver` 指到 `.../Skin0/Resources`，和 base 保持一致） |
| 别的角色目录（`jade_*`） | patcher 只查与 WAD 同名的角色，但我们仍逐个改写（不依赖检查范围） |
| voiceOver 单位的事件 | 不查（`Play_vo_…` 里的别的皮肤名字不影响） |
| base 皮肤自己也列的事件 | `stock` 例外 |
| `Skin0`（序号 0） | 数字 0 不算「别的皮肤」 |

### 4.7 动画图：皮肤自己的动作（不参与检查，但不做游戏里动作不对）

`electron/export/skin-animation.ts`。这条**不是** LTK 的门，是「游戏里看起来对不对」：

- 皮肤 bin 里有一句 `animationGraphData: link = "Characters/<角色>/Animations/Skin<n>"`
  （bin 里存的是这个路径的 FNV-1a 哈希，精简名字表下 py 里看到的就是 `0x…`），指到**皮肤自己**
  的动画图 `data/characters/<角色>/animations/skin<n>.bin`；
- 改成 base 皮肤后，游戏按 base 那边读 `animations/skin0.bin`。传说/终极这类皮肤的动作
  （走路 `run.anm` 等）在皮肤自己的动画图里，base 那份里没有 —— 模型就会**滑步、走路没有动画**；
- 做法（照 Rose 的皮肤包，例如 `LeagueSkins/skins/21/21069/21069.fantome`）：
  1. 按路径哈希从游戏 WAD 取出 `animations/skin<n>.bin`（动画文件 `.anm` 不用随包，游戏里有）；
  2. 把它的 entry key 和 `objectPath` 从 `Characters/<角色>/Animations/Skin<n>` 改成 `.../Skin0`
     （py 里可能是字符串、也可能是哈希，两种都换）；
  3. 放进包里 `data/characters/<角色>/animations/skin0.bin`；
  4. 皮肤 bin 里的 `animationGraphData` 链接、以及 `linked` 清单里 `"DATA/…/Animations/Skin<n>.bin"`
     那一行，都改到 Skin0；
- 本来链接就是 `Skin0` 的皮肤跳过；游戏 WAD 里找不到那份动画图时保持原引用（和以前一样）。

> 这一条只解决「动作来自哪份动画图」。MissFortune 21_69 实测只加这条还不够：还得把
> 骨架引用的大小写、`objectPath`、悬空的 `skinUpgradeData` 一起换干净（§4.2）。

已核对：我们出的 `21_69` 里那份动画图和 Rose 包里的逐条相同（只差他们自己加的一个
`SubmeshVisibilityEventData`），`skin0.bin` 与上一版只差上面两处链接。

---

## 5. 常见坑

| 坑 | 现象 | 原因 / 正确做法 |
| --- | --- | --- |
| 往 `.skn/.skl` 末尾补 0 | 还是被判 skinhack | 规则用**前缀比较**忽略尾巴；骨架还会去填充后再比。必须改内容（§4.1） |
| 用别的皮肤的网格改个后缀 | 网格命中 | 前 N 字节完全一样就是「同一个网格」 |
| 只改网格不改名字 | `ChampionSkinName`/`BankUnits.Events` 命中 | 两道门都要过 |
| 只改名字不改网格 | `SkinMeshProperties` 命中 | 同上 |
| 事件名只改 `Play_sfx_` 那种 | 状态类事件漏掉 | 见 §4.4，两种写法都要换 |
| 事件改名了但没往 bank 补别名 | **不报 skinhack，但游戏里没声音** | 别名 Event 必须写进包里加载的 bank（§4.3） |
| 同一个英雄的几个皮肤同时构建 | 其中一个 zip 只有 **335 字节**，LTK 日志 `overrides added=0`，游戏里什么都不换 | 解包/输出目录是按英雄分的、构建开头还会清空，两个构建会互相删文件。现在同一英雄的构建在 `loadSkinDataByFile()` 里串行；空 WAD（<1 KB）和空包（<8 KB）也会直接报错/拒收 |
| 传说/终极皮肤「走路没有动画」、滑步 | 包能挂上、名字检查也过，就是走起来不播动作 | 三处身份没换干净：骨架引用大小写、`objectPath`、目标不在包里的 `skinUpgradeData`（§4.2）。参照 Rose 的 `21069.fantome` 逐项对齐后正常 |
| 皮肤专属动作（跑步/技能动作）不对 | 模型在、动作像 base 皮肤的 | 皮肤 bin 的 `animationGraphData` 指向 `Animations/Skin<n>`，包里没带那份动画图 → §4.7 |
| 模型少枪/少挂件 | 动作、声音都对了，模型上少一两个部件 | 这些 submesh 被 `initialSubmeshToHide` 藏着、原本靠 gear 系统显示；gear 数据被去掉后要补显示（§4.2，日志 `… submesh 补显示：…`） |
| 放技能后模型上的特效没有 | 皮肤、动作都正常，W/被动这类挂在枪上的特效不显示 | 这些特效 key 在皮肤 `Resources` 里是 `0x0`，靠 gear 的 `mVFXResourceResolver` 补；gear 去掉后要把映射补进 `Resources`（§4.2，日志 `特效映射补 N 条`） |
| 炫彩（chroma）的技能特效歪/没有 | 模型和走路都对，Q 的火焰方向不对、E 的火箭看不到、R 没特效 | 源皮肤是炫彩（`skinParent` + `skinClassification = 2`），塞进 base 槽位后父皮肤不在，特效解析链（动画图 `mEffectKey` → `Resources.resourceMap` → 父皮肤粒子）失效；按独立皮肤的身份写（§4.2，日志 `炫彩按独立皮肤写`） |
| 独立皮肤（不是炫彩）也 Q 火焰歪 / E 火箭和 R 特效没有 | 皮肤是自己带粒子、带动画图的那种（Rumble 68003 最典型） | builder ≤ 6 把粒子内嵌进 base bin，且身份改写把 `objectPath` 挪到了 `Skin0`、`linked` 漏了 base 清单 —— 见 §4.2.1（builder 7 的 base-slot 外壳） |
| 皮肤脚下一直挂着一团光/闪电 | 技能/被动都对，就是模型原点有常驻特效 | 两个来源，都在 §4.2.1：① `idleParticlesEffects` 的 `boneName` 在皮肤骨架里不存在（`Spike`/`robot_root`…），塌到原点；② 删 `keywordsRequired` 时把 `keywordsExcluded` 也删了，base 皮肤的 `P_buf` 光晕变成常驻 |
| 改完还是缺特效，翻遍游戏数据都找不到那段定义 | 某个技能（Rumble 的 R）纯数据重建后完全没有特效 | 缺的是 props 里的**触发条件**（游戏数据没有），粒子定义本身在皮肤 bin 里；`mResourceResolver` 只能引用同一个 bin 的条目 → 走英雄专属补丁（§4.2.2） |
| 补丁插进去了但游戏里还是不亮 | 包里能看到 `VfxSystemDefinitionData`，游戏不渲染 | 没人引用它。`PersistentVfxData.effectKey` 要在 `Resources.resourceMap` 里解析得到，R 的燃烧引用（`0x74ad149b`）也要指过来 —— `resourceMap.set`（§4.2.2） |
| 同一段特效渲染两遍（Q 的火焰两个方向） | 特效出现了，但方向/位置有两份 | 同一个粒子被两套 key 各解析一遍：base 皮肤那份 resolver 里的 key 和皮肤自己的 key 都指向同一段粒子。用 `resourceMap.remove` 删掉多的那套（§4.2.2，Rumble 的 `0x52c319c0`/`0x55c31e79`） |
| 换版本后旧包还是老样子 | 界面里已经有 zip，不会重新生成 | 包内容版本变了（`SKIN_ARCHIVE_BUILDER`），旧包会被当成「没有」自动重建；想强制重来就删掉那个 zip（或 `*.zip.check.json`） |
| 直接改语言 WAD 里的语音 bank | 某些语言没声音 | 用语言无关的 sidecar（§4.5） |
| 转文本时没屏蔽 LTK 共享缓存 | 同一份 bin 在不同机器上转出来的文本不一样（装了 LTK Manager 的会解出名字，没装的全是哈希），排查时对不上 | 转换时用 `--hashtable-dir` 指到空目录，只用我们自己的精简表（见 `ritobin.ts`） |
| 检查通过但游戏里仍没换肤 | 看 LTK 日志是不是**别的 mod** 被拒 | patcher 一次拒一个 WAD，可能不是你这个包 |

---

## 6. 每次改动后的自检清单

1. `npm run skincheck:test`（LTK 名字规则）、`npm run banks:test`（别名规划）、
   `npm run rebase:test`（网格重建 + 身份改写）、`npm run audio:test`、`npm run anim:test`（动画图改名）、
   `npm run baseslot:test`（base-slot 外壳）、`npm run patch:test`（英雄专属补丁层）、
   `npm run archive:test`（强制重建前的删包范围）；
2. 真实构建一个皮肤（选一个「有状态类事件」的，比如 Akali 102 或者新英雄），看日志里
   有没有 `[检查] … 通过 LTK 名字检查`；
3. 进游戏 → 看 LTK Manager 日志里有没有 `c0000229`；有问题就去
   `incidents\*.json` 看 `overlayDetail`；
4. 改了字段名/音频逻辑，一定要用**新旧两版**同皮肤对比 WAD 条目内容（不是 zip 字节，
   zip 带时间戳和压缩差异会变）。

---

## 7. 相关文件索引

| 文件 | 作用 |
| --- | --- |
| `electron/export/load-skin-data.ts` | 生成流程主控（解包 → 转换 → 改写 → 打包 → 检查） |
| `electron/export/ritobin.ts` | `ritobin-tools` 调用封装（批量、精简名字表、屏蔽共享缓存） |
| `electron/export/skin-rebase.ts` | 身份改写（championSkinName / skeleton / simpleSkin / 音频段） |
| `electron/export/skin-animation.ts` | 动画图（`animations/skin<n>.bin`）改名成 Skin0 + 链接改写 |
| `electron/export/skin-mesh.ts` | SKN/SKL 重建（null_bone / 末顶点拷贝） |
| `electron/export/skin-audio.ts` | 音频段解析与整段替换（brace 匹配，格式无关） |
| `electron/export/skin-banks.ts` | 音效/语音别名规划（换事件名 + bank 补 Action + sidecar） |
| `electron/export/bnk.ts` | BNK 读写（照 Rose 的 `bnk.py`，没改过的 bank 逐字节写回） |
| `electron/export/skin-check.ts` | LTK 名字检查 + `.check.json` 读写 |
| `electron/export/skin-base-slot.ts` | base-slot 外壳重建（builder 7，规则见 §4.2.1） |
| `electron/export/skin-patch.ts` | 英雄专属补丁层的套用逻辑（builder 8，三类插入） |
| `electron/export/skin-patches/` | 各英雄的补丁数据（`index.ts` 注册表，`rumble.ts` 是 R 燃烧特效） |
| `electron/export/index.ts` | 注入入口 `injectSkin()`：读检查结果，不通过就不加载 |
| `electron/export/wad-index.ts` | 皮肤 bin 索引（`skinbins-index.txt`）的读取与定向解包 |
| `test/skin-check.test.mjs` | LTK 名字规则的单测 |
| `test/skin-animation.test.mjs` | 动画图改名的单测（字符串 / 哈希两种文本形态） |
| `test/skin-patch.test.mjs` | 补丁层单测（缩进、幂等、坏片段、Rumble 补丁内容） |
| `docs/HOW-IT-WORKS.md` | 整体架构（本文件是它 §6 的展开） |

---

## 8. 附录：从零把 LTK 的判定逻辑挖出来

这一节记录 **§3 那些规则是怎么来的**，以及换了机器 / LTK 更新后怎么自己重挖一遍。
不需要反编译，也不需要问人。

三步就够：

1. 读 `delivery.json` → 拿到 `ltk_patcher-N` 和 manager commit（§8.2）；
2. `git show <commit>:crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs` → 规则（§8.3）；
3. 从 DLL 抽字符串 → 确认这一版实际查哪几项（§8.5）。

### 8.1 先分清：两套代码，一个规则

| 层 | 在哪 | 怎么拿到 |
| --- | --- | --- |
| **运行时真正拒绝 WAD 的扫描** | patcher DLL（`ltk_patcher_dll`）。Manager 启动时从 `patcher.leaguetoolkit.dev` 下载**签名过的**发布包，解到本地 | 源码不在公开仓库（`LeagueToolkit/ltk-patcher` 是 404）。只能间接取证：它的日志、incidents、DLL 里的字符串、行为对照 |
| **规则的可读镜像**（Manager 的 Library 体检用） | 公开仓库 `LeagueToolkit/ltk-manager` 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/` | 直接 clone 读源码 |

两边是「镜像」关系，源码注释写得很直白：

> `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs` 开头：
> *"Mirrors the base-skin check of the patcher's anti-skinhack scan, which blocks the champion WAD."*

所以：**读规则、写复刻**用镜像（§8.3）；**确认线上行为、确认版本**用 DLL（§8.2、§8.5）。

### 8.2 第一步：读出你面对的是哪个版本

Manager 把「当前用哪个 patcher」记在：

```
%APPDATA%\dev.leaguetoolkit.manager\patcher\delivery.json
```

里面两段 base64 编码的 JSON：`token[0]` 是 Manager 自己的版本和 commit，
`channels.stable.envelope.manifest` 是 patcher 发布清单。解出来：

```powershell
$d = Get-Content "$env:APPDATA\dev.leaguetoolkit.manager\patcher\delivery.json" -Raw | ConvertFrom-Json

# Manager 版本 + commit（token 的第一段是 base64url 的 JSON，第二段是签名）
$payload = $d.token.Split('.')[0].Replace('-', '+').Replace('_', '/')
$payload += '=' * ((4 - $payload.Length % 4) % 4)
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json | Format-List

# patcher 发布清单：版本、digest、大小、协议版本、过期时间
$manifest = $d.channels.stable.envelope.manifest
$manifest += '=' * ((4 - $manifest.Length % 4) % 4)
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($manifest)) | ConvertFrom-Json |
  Select-Object -ExpandProperty release | Format-List
```

本机（2026-11-20）的结果：

```
manager : 1.33.0
commit  : 071dc2dd55877f5d77877463f14363720c9603ef   # release/v1.33.0

version  : ltk_patcher-32
digest   : 752b3c46899f43d121f88b673e2e5a65e3eb24af2a3ac16c7143de730565fdf7
size     : 851200
protocol : 3
eol      : 1796803200                                  # 2026-12-09 08:00Z
```

对应的 DLL 就放在 `patcher\<digest>\ltk_patcher_dll.dll`，清单里的 `digest` 就是它的
SHA-256（`Get-FileHash` 可核对，本机一致）。另外 Manager 日志里那行 `manager=1.33.0`
也是同一个信息。

> 注意：`delivery.json` 里的 **manager commit** 不是 patcher 的 commit —— patcher 是另一个
> 项目、另一条发布线（`ltk_patcher-<N>`），只能靠 `ltk_patcher-N` 这个号来对齐。

### 8.3 拿到镜像规则（读源码）

```bash
# 只下需要的 blob，仓库很小；网慢也不怕
git clone --filter=blob:none https://github.com/LeagueToolkit/ltk-manager.git ltk-src
cd ltk-src

# 只看某个版本里的规则文件（不用 checkout，按需拉 blob）
git show 071dc2dd:crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs | less

# 想全文检索/改注释，再切过去
git checkout 071dc2dd
```

关键文件表（按「能回答什么问题」排）：

> 本机已经有一份这样的只读参考在 `%TEMP%\ltk-src`（`git remote -v` / `git log -1` 可查
> 它来自哪个仓库、哪个 commit），需要重挖时照上面重建一份即可。

| 文件 | 能回答什么 |
| --- | --- |
| `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs` | 规则本体：`evidence_in()`、`Markers`、`names_other_skin()`、`MergedMesh::matches()`（§3 就是照它写的） |
| `.../bin_skinhack/tests.rs` | 用构造 bin 写的用例，边界最直观：`Skin0` 不算、`stock` 例外、voiceOver 不查、前缀匹配、补零骨架 |
| `.../bin_skinhack/repair.rs` | 官方修法：只删/改音频，不搬 bank |
| `crates/ltk-manager-problems/src/rules/mod.rs` | 规则注册（`rules::all()`） |
| `crates/ltk-manager-runtime/src/diagnostics/incident.rs` | `c0000229` → `ScanStatus::Skinhack` 的映射、verdict/incident 字段 |
| `crates/ltk-manager-runtime/src/patcher/host/protocol.rs` | host 行协议、hook flags（含 §8.8 的 opt-out 位） |
| `src/modules/patcher/utils/scanStatus.ts` | 每种拒绝给用户看的文案；skinhack 的官方定义（"an official Riot skin ported onto a base champion"） |
| `crates/ltk-manager-library/src/mods/health.rs` | Manager 的 Library 体检怎么跑这套规则（§8.6） |
| `docs/ux/PROJECT_PROBLEMS.md` | 规则的**变更史**和「The skinhack rule」一节（§8.4） |
| `docs/ux/LEAGUE_DIAGNOSTICS.md` | DLL 行协议、短语来源（"the DLL's phrases come from `ltk-patcher`"） |
| `src/modules/library/utils/skinhackCheck.ts` | 另一层封禁：按作者/描述黑名单（§2.7），和内容扫描无关 |

### 8.4 官方文档里的规则说明（比源码还好读）

`docs/ux/PROJECT_PROBLEMS.md` 里有「The skinhack rule」一节，直接用表格列了四种命中
（Mesh / Skin name / Audio tag / Audio bank unit），并说明：

- Mesh 命中**只报网格**；否则把所有名字命中一起报；
- 官方修复**只在全部命中都是音频时**才给：删掉命中另一个皮肤的单位和 tag、保留 base 和
  voiceOver 单位、必要时从游戏 skin0 补回 SFX 单位、并把 clip `SoundEventData` / VFX 音效
  字段里的事件名 `Play_sfx_AhriSkin07_Cast` → `Play_sfx_Ahri_Cast`（只有 base 也列了才改）。

同文件顶部还有一张**变更表**（每次改规则加一行，只留最近十条），这就是最快的「这版规则
又加了什么」：

```
| 2026-11-05 | `bin/skinhack` checks padded meshes and bank unit events |
| 2026-10-30 | `bin/skinhack` removes the audio of another skin          |
| 2026-10-25 | `bin/skinhack` reports a base skin built from another skin  |
```

### 8.5 从闭源 DLL 里挖证据（不用反编译）

DLL 里保留着 Rust 的 panic 位置字符串，所以**源码路径、evidence 文案、读哪些字段**都能直接抽出来：

```powershell
$dll = Get-ChildItem "$env:APPDATA\dev.leaguetoolkit.manager\patcher" -Recurse -Filter ltk_patcher_dll.dll |
  Select-Object -First 1
$text = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($dll.FullName))
[regex]::Matches($text, '[ -~]{6,}') | ForEach-Object { $_.Value } |
  Select-String -Pattern 'base-skin|skin database|SkinMesh|SkinAudio|WAD scan|anti-hack' |
  Select-Object -First 40
```

本机 `ltk_patcher-32` 抽到的（节选，`…` 是格式化占位符）：

```
crates\ltk_patcher_dll\src\verify\ah.rs
base-skin check for …
base-skin check: …
base-skin check: … is not in the skin database; content check skipped
base-skin check: skin database for …
… is unmodified; base-skin check skipped
SkinMeshProperties Skeleton SimpleSkin
ChampionSkinName TagEventList SkinAudioProperties.TagEventList
Name _sfx SkinAudioProperties.BankUnits.Name voiceOver SkinAudioProperties.BankUnits.Events
WAD scan failed status with …
… launch; anti-hack scan will not block
```

从这几行就能确认：

- 执行检查的源码在 `crates\ltk_patcher_dll\src\verify\ah.rs`（不在公开仓库）；
- 它读的字段和 §3.3 完全一致（`ChampionSkinName`、`TagEventList`、`BankUnits.Name`、
  `BankUnits.Events`、`voiceOver`），单位名用 `_sfx` 后缀；
- **哪项检查存在，看 DLL 里有没有对应的 evidence 字符串**：比如字符串里有
  `SkinAudioProperties.BankUnits.Events`，说明这个版本的 patcher 查事件名（84_102 就是被这条拒的）；
- `… launch; anti-hack scan will not block` 是启动方式的分支：字符串里能看到 `spectator`、
  `PBE` 这类前缀 —— 某些启动方式下扫描只警告、不阻塞。

再配合 §2.2/§2.3 的日志与 incidents（结构化字段、`suspects[]`），就是完整的运行时取证。

### 8.6 Manager 的离线体检 = 同一份镜像规则

`crates/ltk-manager-library/src/mods/health.rs` 会调 `problems::rules::all()` 扫库里/工作区的
mod，所以「Library → 某个 mod 的健康检查/Problems」得到的是和进游戏**同源**的结论，不用启动
游戏就能复现。我们自己的 `npm run skincheck:test` 只复刻了**名字**那一半（网格靠 §4.1 的
重建从结构上避开），不能替代它的网格检查。

### 8.7 版本漂移怎么跟

规则真的会变。以本机为例：

- patcher 发布 `ltk_patcher-32`（2026-11-18 构建），DLL 里已经有 `BankUnits.Events` 检查；
- Manager 1.33.0 的 commit（`071dc2dd`）里，镜像**还没有**事件名检查（只报单位名）——
  `git show 071dc2dd:.../bin_skinhack/mod.rs` 和 HEAD 一比就能看到：HEAD 新增了
  `other_skin_events()`、`stock`、voiceOver 处理、以及「补零骨架」的判定；
- 所以文档里 §3 是按**镜像 HEAD + DLL 字符串**对齐写的，而不是只照 manager 版本号。

跟进方法（每次 `delivery.json` 里的 `ltk_patcher-N` 变了就做一次）：

1. 看 `docs/ux/PROJECT_PROBLEMS.md` 顶部变更表，有没有 `bin/skinhack` 的新行；
2. `git diff <旧commit>..HEAD -- .../bin_skinhack/mod.rs`（或直接看 `git log --oneline -- 那个目录`）；
3. 用 §8.5 的命令确认新 DLL 里多了/少了哪些 evidence 字符串；
4. 用 §2 的日志 + 一个构造包做 A/B（改一处，看还报不报）。

### 8.8 关于「关掉检查」的开关（存在，但不建议）

patcher 的 host 协议里有 hook flags（`crates/ltk-manager-runtime/src/patcher/host/protocol.rs`），
其中 `OPT_OUT_AH_V1`（bit 4）的注释写着：

> *"opt out of anti-skinhack v1 enforcement: a failed WAD scan is downgraded from a blocking error
> to a warning, so patching proceeds instead of aborting."*

对应环境变量名 `CSLOL_HOOK_OPT_OUT_AH_V1`。**LTK Manager 自己从不设置它**
（`src-tauri/src/services/patcher.rs` 只组装 `FULL_WAD_SCAN`）。

不建议依赖它：它只是让检查闭嘴，包本身仍然指向别的皮肤的网格/名字，崩溃、黑屏、模型错乱
都还在；LTK 的文案也写明了这是「避免把游戏搞崩」的安全措施。正经做法还是 §4。

---

## 9. 参考链接

- LTK Manager（公开）：<https://github.com/LeagueToolkit/ltk-manager>
- 规则源码：`crates/ltk-manager-problems/src/rules/bin_skinhack/`（`mod.rs` / `tests.rs` / `repair.rs`）
- 规则说明：`docs/ux/PROJECT_PROBLEMS.md` 的「The skinhack rule」
- 诊断/日志：`docs/ux/LEAGUE_DIAGNOSTICS.md`
- ritobin / 名字表：<https://github.com/LeagueToolkit/ritobin-tools>
- 本文件的规则基准：patcher `ltk_patcher-32` / Manager 1.33.0（commit `071dc2dd`），2026-11-20 核对
