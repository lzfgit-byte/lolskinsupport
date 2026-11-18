# 技术说明：lolskinsupport 是怎么生效的

本文说明一次「选皮肤 → 游戏里出现皮肤」背后发生了什么，以及出问题时该看哪里。
面向维护者，不是使用说明（使用准备见 [README](../README.md)）。

---

## 1. 一句话概括

本程序自己不碰游戏进程：它把皮肤压缩包交给 **LTK Manager** 的模组库，让 LTK Manager
启动它自己的 patcher；而我们通过一个注入进 LTK Manager 的 **LTF 桥（TCP + token）**
来驱动「导入 / 开关模组 / 启停 patcher」这些操作。

```
Electron 主进程 ──(TCP JSON, 127.0.0.1:46321-46340)──> LeagueToolFlop.dll（跑在 ltk-manager.exe 里）
                                                              │
                                                              └──(LTK 自己的 CDP/IPC)──> LTK Manager 前端
                                                                                            │
                                                                                      LTK patcher
                                                                                            │
                                                                                     英雄联盟游戏进程
```

---

## 2. 进程与模块

| 进程 / 组件 | 是什么 | 在本项目里的位置 |
|---|---|---|
| Electron 渲染进程（Vue） | 界面：英雄列表、皮肤列表、设置、日志面板 | `src/` |
| Electron 主进程 | 全部实际操作：读配置、连 LCU、导入皮肤、调注入 | `electron/` |
| LCU 客户端 | 英雄联盟客户端，暴露 lockfile + HTTPS + WebSocket | 由 `lcuConnector` 连接 |
| LTK Manager | 外部程序，真正的 patcher 宿主 | 用户安装，`C:\Program Files\LTK Manager` 等 |
| LTF 桥 | `ltk_launcher.exe` + `LeagueToolFlop.dll` | 打包进 `resources\ltf\`，源码在 `native\ltf\` |

主进程关键模块：

| 文件 | 职责 |
|---|---|
| `electron/main/index.ts` | 建窗口、初始化 LCU、注册 IPC |
| `electron/http/lcuConnector.ts` | 读 lockfile、连 LCU WebSocket、订阅事件、断线重连 |
| `electron/http/gameflowMonitor.ts` | 解析 gameflow 阶段与选人会话，发出 `champion-selected` |
| `electron/export/index.ts` | IPC 门面：`loadSkin` / `loadSkins` / `shoutDownModTools` / 配置读写 |
| `electron/export/ltfSession.ts` | 注入会话：启动 LTK Manager、导入、开关、启停 patcher、收尾 |
| `electron/export/shutdown.ts` | 退出清理：关窗口 / 退出时收尾，硬超时后强制关掉 LTK Manager |
| `electron/export/ltfBridge.ts` | 桥客户端：端口/令牌发现、逐行 JSON 协议 |
| `electron/export/league-skins-import.ts` | LeagueSkins 整包导入（流式、去重、预检） |
| `electron/export/skin-sync.ts` | 皮肤自动同步：拉清单、按 SHA 判变化、走代理下载 |
| `electron/utils/zip-archive.ts` | 流式 ZIP 读取器（ZIP64，>2 GiB 可用） |

---

## 3. 主流程：从打开程序到皮肤生效

### 3.1 启动

1. 主进程读 `%LOCALAPPDATA%\lol-skin-ll\config.json`（没有就用默认值）。
2. `initLcu()` → `lcuConnector.startAutoConnect()`：
   - 从 `GAME_PATH` 推出 `..\lockfile`，解析出 `端口 / 密码`；
   - 用 `riot:<密码>` 连 `wss://127.0.0.1:<端口>`；
   - 订阅 `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase`、
     `OnJsonApiEvent_lol-champ-select_v1_session`、`OnJsonApiEvent_lol-lobby_v2_lobby`；
   - WebSocket 不稳时自动退化为 HTTP 轮询。
3. `gameflowMonitor.start()`：进入选人阶段后额外订阅选人会话，跟踪本地玩家是否**锁定**英雄。
4. 每 1 秒把 LCU 连接状态、注入状态推给渲染进程（`notify-lcu-connect`、`notify-mod-tools-connect`）。

> 注意：`GAME_PATH` 不只是「游戏目录」，LCU 的 lockfile 也是从它推出来的。
> 路径错了，选人事件就收不到，界面也就不会跟着换英雄。

### 3.2 选英雄

`gameflowMonitor` 判定「本地玩家已完成 pick」后发 `champion-selected` →
渲染进程记下 `heroId` → 英雄页列出本地皮肤（`skins\<suffix>\<heroId>\*.zip`）
与网络皮肤图/名。

### 3.3 点「使用皮肤」

渲染进程 `applySelectedSkin()`：

1. `checkHasSkins(heroId, skinId)`：确认 `skins\<suffix>\<heroId>\<heroId>_<n>.zip` 存在；
2. 必要时先由 WAD 生成皮肤 zip（用到 cslol-tools，见第 6 节）；
3. `f_loadSkin()` → 主进程 `loadSkin()`：
   - 记录「皮肤使用中」的记录目录 `overlays\<heroId>_<skinId>\`；
   - 写 `overlay_config`（当前皮肤 id）与 `SKIN_IMAGE`；
   - 调 `ltfInjector.applySkins([...])` —— 注入会话开始（下一节）。

### 3.4 注入会话（核心）

`LtfInjector.applySkins()`：

```
ensureSession()
  ├─ 有活着的会话？直接复用
  ├─ 读 ltf_session.json，有残留就先清理（上次崩溃/被杀）
  ├─ 已有桥？→ 复用（并判断这个 LTK Manager 是不是自己启动的）
  ├─ 有 ltk-manager.exe 在跑但没有桥？→ 报错让用户关掉
  └─ 否则：ltk_launcher.exe --exe <ltk-manager.exe> --quiet --log-dir <logs\ltk>
             → 解析 stdout 的 LTK_MANAGER_PID=<pid>
             → 30s 内轮询找到桥 → 等 LTK 内置浏览器（CDP）就绪
             → health_check_off（关掉「自动检查模组」）
换皮肤：先 stop_patcher + 撤掉上一次导入
对每个皮肤：
  stageArchive()   把 zip 硬链接成 <data>\ltf_staging\<hero>_<skin>.fantome（跨盘则复制）
  importOne()      桥 import → 拿到条目 id（新建 / 已存在，见 4.3）
  toggle(id, true) 只启用本次皮肤
disableOtherMods() 把用户自己在 LTK 里开着的其它模组临时关掉并记账
startPatcher()     让 LTK 启动它自己的 patcher（构建 overlay、扫描游戏进程）
writeSessionState() 写入 ltf_session.json
```

**之后游戏启动，patcher 已经在扫描，皮肤随游戏加载生效。**
所以：**必须是注入之后新开的一局**；游戏已经开始才点「使用皮肤」，只会对下一局生效。

### 3.5 收尾

**两条路都会走到 `LtfInjector` 的收尾**，区别只是等不等得起：

| 触发 | 入口 | 时间预算 |
|---|---|---|
| 点「停止注入」 / 换皮肤 | `shutdownModTools()` → `ltfInjector.stop()` | 不催，慢慢等 |
| 关窗口、`app.quit()`、Ctrl+C | `shutdown()`（`electron/export/shutdown.ts`） | 15 秒硬上限，超时强杀 |

收尾顺序：

```
stop_patcher() → 轮询 patcher_status 直到 running=false（预算用完就不等了）
撤掉本次导入：新建的 uninstall，复用的恢复原 enabled 状态
把 disableOtherMods 关掉的用户模组重新开回来
如果这个 LTK Manager 是自己启动的：kill() → 1.5~3s 内没退就 taskkill /PID <pid> /T /F
删掉 ltf_session.json；没撤完的部分留在里面，下次启动补清
```

**程序退出是怎么接上的**（`electron/main/index.ts`）：

- 窗口 `close` 事件先 `preventDefault()`，等 `shutdown()` 做完再 `win.destroy()`；
- 窗口被系统/其他途径关掉时，`before-quit` 也会拦一次，做完清理再 `app.quit()`；
- `SIGINT` / `SIGTERM` 走同一条路；
- 最后一道保险 `process.on('exit')`：真走到 `app.exit()` / `process.exit()` 而清理没做完，
  就同步 `taskkill` 掉 `ltf_session.json` 里记录的、本程序启动的 LTK Manager。

清理期间界面会弹一条「正在停止注入并关闭 LTK Manager…」。正常一次退出约 1~2 秒
（停 patcher + 删条目 + 关管理器）；桥没应答时最多等 15 秒，然后强杀。

> 代价：关掉程序 = 停掉 patcher，**游戏进行中关程序，本局皮肤就不再生效**（Rose 也一样）。

用户自己手动打开的 LTK Manager **不会被关闭**（`startedByUs=false`），只会恢复它的模组开关。

> 退出时如果来不及删掉本次导入（比如预算用完），条目会留在 `ltf_session.json` 里；
> 下次启动 `ensureSession()` 拿到桥之后由 `sweepPrevious()` 删掉 —— 不会在 LTK
> Manager 的模组库里越积越多。

---

## 4. LTF 桥

### 4.1 为什么需要桥

LTK Manager 当前版本没有对外的命令行/API（旧版曾有 `mkoverlay` / `patcher` 子命令），
只有前端 IPC。LTF 的做法是：
`ltk_launcher.exe` 以隐藏方式启动 LTK Manager，并把 `LeagueToolFlop.dll` 注入进去；
DLL 在 LTK Manager 进程内起一个 TCP 服务，用 CDP 驱动它自己的前端。

### 4.2 发现与鉴权

端口发现顺序（与 Rose 一致）：

1. 注册表 `HKCU\Software\LTKBridge\ApiPort`
2. `%LOCALAPPDATA%\LTKBridge\port.txt`
3. `C:\Users\Public\LTKBridge.port`
4. 并发扫描 `46321..46340`

拿到端口后先发 `{"cmd":"hello"}` 校验 `service == "LTKBridge"`；给了 `expectedPid` 时还要求
`hello.pid` 一致（防止认到旧的或别的程序的桥）。

令牌：`%LOCALAPPDATA%\LTKBridge\token.txt`，其次注册表 `ApiToken`。除 `hello`/`ping` 外
每条命令都带 `token`；被回 `unauthorized` 时会把所有已知副本重试一遍（桥重启换过令牌）。

### 4.3 协议

一行 JSON 请求，一条连接一次，回一行 JSON：

| 命令 | 主要参数 | 用途 |
|---|---|---|
| `hello` / `ping` | — | 探活、取 pid |
| `status` | — | 桥/CDP/游戏路径状态 |
| `list` | — | LTK 模组库（`library[]`） |
| `import` | `path`（或 `data_b64`）+ `name` | 装进库；应答 `response.value = {kind, mod}` |
| `toggle` | `target`（id）+ `enabled` | 启用/停用 |
| `uninstall` | `target` | 从库删除 |
| `health_check_off` | — | 关掉 LTK「自动检查模组」 |
| `start_patcher` / `stop_patcher` | — | 启停 LTK 的 patcher |
| `patcher_status` | — | `response.value.running` |
| `kill` | — | 让 LTK Manager 退出 |

**`import` 的坑（已处理）**：LTK 按内容去重。

- 新装：`{kind:"installed", mod:{id,...}}`
- 同内容已在库里：`{kind:"alreadyInstalled", mod:{id,...}}`

后者说明这是**用户自己的模组**，结束时只能恢复它的开关状态，不能卸载（否则会删用户的东西）。

### 4.4 状态文件

`%LOCALAPPDATA%\lol-skin-ll\ltf_session.json`：

```json
{
  "managerPid": 12345,
  "startedByUs": true,
  "imports": [{ "id": "uuid", "created": true, "wasEnabled": false }],
  "disabled": ["uuid-of-user-mod"]
}
```

程序崩溃/被强杀后 —— 或者退出时没来得及删完（预算用完）—— `ltf_session.json` 会留下来。
下次 `ensureSession()` 先启动/复用 LTK Manager，**拿到桥之后**由 `sweepPrevious()` 按它清理：
停 patcher、卸载 `created=true` 的条目、恢复其它条目的开关，然后才装这一次的皮肤。

> 为什么要等桥：模组库存在 LTK Manager 里，管理器没起来就没有能删条目的接口。
> 所以记录不会被「清不掉就丢掉」，而是留着下次继续；`dropRecorded()` 还会读一次
> 库核对，已经被用户自己删掉的条目直接从记录里去掉。

---

## 5. 皮肤数据

### 5.1 文件格式

本地皮肤是 **fantome 结构** 的 zip：

```
<heroId>_<n>.zip
├── META/info.json          # Name / Author / Version
└── WAD/<Champion>.wad.client
```

### 5.2 路径规则

`skins\<皮肤目录后缀>\<heroId>\<heroId>_<n>.zip`
（后缀默认 `leagueSkins`，可配置为 `wad_skins` 等。）

### 5.3 LeagueSkins 整包导入

整包约 4~5 GB / 2 万条目，**不能整包读进内存**（Node Buffer 上限 2 GiB）：

1. `ZipArchive.open()`：只读 EOCD/ZIP64 + 中央目录（本机实测 22244 条目解析 13ms）；
2. 筛 `.fantome`，按 `skins/<英雄>/<皮肤>/...` 解析出目标 `<heroId>/<heroId>_<n>.zip`；
3. 目标已存在时按内容判断：**大小和 CRC32 都与条目一致才跳过**（等价于覆盖，字节完全相同）；
   大小不同或 CRC 不同都覆盖成压缩包里的版本（压缩包是权威来源）；
4. 预检磁盘空间（留 2 GB 余量）；
5. 逐条流式解压：写 `.part` → 改名，单条失败只记失败。

> 为什么不是无条件覆盖：整包 9000+ 皮肤，无条件重写每次要写 3~4 GB；
> 用 CRC 比对后，内容没变就只读不写（3.9 GB 校验约 4 秒），内容有变化仍然会覆盖。

`classic/`（经典模式）条目不在 `skins/` 结构里，会被跳过并计入「未识别」。

### 5.4 皮肤自动同步

`electron/export/skin-sync.ts`，数据源与 Rose 相同：GitHub 仓库 `Alban1911/LeagueSkins`。

```
manifest:  https://raw.githubusercontent.com/Alban1911/LeagueSkins/manifest/manifest.json
文件:      https://raw.githubusercontent.com/Alban1911/LeagueSkins/<commit 或 main>/<路径>
兜底清单:  https://api.github.com/repos/Alban1911/LeagueSkins/git/trees/main?recursive=1
```

1. 清单是 `[路径, git blob SHA, 大小]` 数组（约 1.1 万条，其中 `skins/` 约 9 千条）。
   `classic/`、`resources/` 会被忽略（本程序只认 `skins/<英雄>/<皮肤>/`）。
2. 目标路径与整包导入完全一致：`<SKIN_PATH>/<后缀>/<英雄>/<英雄>_<序号>.zip`。
   状态记在 `<数据目录>/skin_sync_state.json`（`路径 -> {sha, size}`）。
3. 判定：清单 SHA 与记录一致且文件在 → 跳过；文件不在 → 下载；SHA 变了 → 下载；
   文件在但没记录（用户手工放的/整包导入的）→ 由 `SKIN_SYNC_MISSING_ONLY` 决定
   「认领」（只记 SHA、不下载）还是「以仓库为准重新下载」；
   **本地文件被改过**（大小和记录不一致，或 mtime 晚于记录时间）→ 也算变化，下载仓库版本还原
   （老状态文件没存 localSize 时只靠 mtime 判断）。
4. 下载：并发 3，写 `<目标>.part`，边下边算 `sha1("blob <长度>\0" + 内容)`，
   与清单 SHA 一致才 `rename` 落盘；失败只记失败并继续。
5. 代理：`SKIN_SYNC_PROXY`（默认 `http://127.0.0.1:10808`）交给 axios 的 `proxy`；
   https 目标由 axios 用 CONNECT 隧道（`HttpsProxyAgent`）。留空才是直连，
   代理连不上会明确报错，不会偷偷绕过。
6. 定时：`startSkinSyncMonitor()` 在窗口建好后启动，启动 20 秒后第一次检查，
   之后按 `SKIN_SYNC_INTERVAL_MIN`（默认 30 分钟）循环；程序退出时 `shutdown()` 里停掉。

界面上「设置 → 皮肤同步」可以改开关 / 代理 / 间隔 / 首次只补缺失，并手动「立即同步」；
「测试代理」只拉一次清单（约 1 MB，超时 120 秒），用来确认代理通不通。

> 首次同步如果没有本地皮肤，等于下载整库（约 4.5 GB）；经本机代理实测速度有限，
> 建议先用「导入 LeagueSkins 整包」落一批，之后只下增量。

---

## 6. 生成皮肤（可选功能）

只有「（多个）全部皮肤文件 /（一个）当前皮肤文件」这条路径会用到 cslol-tools：

```
游戏 wad (DATA/FINAL/Champions/<alias>.wad.client)
  └─ wad-extract.exe → ritobin_cli（.bin ↔ .py）→ 改皮肤 → wad-make.exe → <hero>_<n>.zip
```

工具目录（`MOD_TOOLS_PATH` 的父目录）需要 `wad-make.exe`、`wad-extract.exe`、
`ritobin\bin\ritobin_cli.exe`、`hashes.game.txt`。**注入本身完全不需要它。**

生成时会对皮肤 bin 做一次 **base-skin 改写**（`electron/export/skin-rebase.ts` +
`skin-mesh.ts` + `skin-audio.ts` + `skin-banks.ts` + `bnk.ts`，对齐 Rose 1.5.9
`injection/baseskin`，提交 `2c64012d`），否则 LTK 的 patcher 会把它当 skinhack。
patcher 的规则在 LTK 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`：
网格和名字都查。

1. **网格重建**（`skin-mesh.ts`，照抄 Rose 的 `mesh.py`）：把皮肤自己的 SKN/SKL
   **重建**后写到 `assets/characters/<champ>/skins/base/<champ>.skn|skl` ——
   骨架多一根没人用的 `null_bone` 根部关节，网格多一个末顶点的拷贝（索引不动，
   没有三角形用它）。文件与游戏自带 base 网格不再是同一内容，但模型和动画完全一样。
   bin 里 `skeleton` / `simpleSkin` 指向这两个 base 路径。
   > 旧实现是往文件末尾补 16 个 0 字节：patcher 比较时**忽略追加的尾巴**，所以补 0
   > 等于没补，包照样被判成「skin0 的网格是别的皮肤的」。Rose 1.5.9 也是因为这个
   > 才改成重建；我们照它改。已经补过 0 的老文件会先把 16 字节削掉再重建。
2. **名字改写**：`championSkinName` 改成该英雄 base 皮肤的名字（从游戏 `skin0.bin` 读，
   例如 `VayneBase`），去掉 `championSkinId`；`SkinAudioProperties` 的
   `tagEventList` / `bankUnits` 整段换成游戏 base 皮肤的（`Vayne_Base_SFX`、
   `Play_sfx_Vayne_...`）。patcher 还会查 `TagEventList`、`BankUnits[].Name`
   （`<英雄>_Skin<n>_SFX`）和非 voiceOver 单位的事件名（`Play_sfx_<英雄>Skin<n>_...`），
   这些名字留在包里就还是 skinhack。

音效（`skin-banks.ts` + `bnk.ts`，对齐 Rose 的 `audio.py`）：皮肤的 `tagEventList`
是优先级链，`{"Vayne", "VayneSkin11"}` 里最后有同名事件的 tag 赢，所以皮肤实际放的是
`Play_sfx_VayneSkin11_...`。作为 base 皮肤运行时链上只剩 base tag，游戏会去找
`Play_sfx_Vayne_...`，皮肤的 bank 里没有这个名字，音效就没了。所以：

1. 在皮肤自己的事件 bank（`<英雄>_Skin<n>_SFX_events.bnk`）里，为每个靠皮肤 tag 才
   够得到的事件补一个 **base 名字的别名 Event**，指向同一批 Action；
2. base 皮肤自己的事件 bank 里同 id 的 Event 删掉（两个加载中的 bank 定义同一个 id，
   客户端只会留一个），改过的 bank 随包一起走 —— 这样音效还是皮肤自己的；
3. bin 里单位名 `<英雄>_Skin<n>_SFX` → `<英雄>_Base_SFX`，事件列表换成别名，
   `Skin<n>` 的老名字不再列出来（列出来就会被 patcher 抓）；事件 bank 里原来的
   `Skin<n>` 事件保留，因为动画/VFX 的 bin 会按全名 post 它们。

bank 不搬家：音频 bank 留在游戏原来的路径上（游戏本来就有），包里只多两个十几 KB 的
事件 bank（皮肤的自己一份 + base 的改过一份）。Rose 是把 bank 整个搬到 base 路径
（包大 1 MB 级），我们这样省体积。

语音（voiceOver）：本地化 bank 每个语言一份、mod 装不全，所以换成游戏 base 皮肤的
VO 单位，语音走 base 的（同一个人配音，差别很小）。

音效核对方式：`%TEMP%\harness\check-ltk.mjs`（离线复刻 patcher 的检查）、
`check-audio.mjs`（单位列的事件都能被包里的 bank 解析）、`check-alias-actions.mjs`
（别名指向的 Action 与游戏原始 bank 一致）。

还没做的另一步：把 48 个内嵌 VFX 条目精简掉（Rose 输出只留 `Skin0` + `Resources` 两个条目），
不影响 LTK 的检查。

---

## 7. 数据目录一览

`%LOCALAPPDATA%\lol-skin-ll`：

| 路径 | 用途 |
|---|---|
| `config.json` | 所有设置（`GAME_PATH`、`SKIN_PATH`、`MOD_TOOLS_PATH`、`LTK_MANAGER_PATH`…） |
| `skins\<suffix>\<hero>\*.zip` | 皮肤文件 |
| `overlays\<hero>_<skin>\` | 「皮肤使用中」的记录目录（不存 wad） |
| `overlay.json` | 当前应用到「皮肤使用中」的皮肤 id 列表 |
| `mod-tools\` | cslol-tools（生成皮肤用） |
| `ltf_staging\` | 交给 LTK 前的 `.fantome` 暂存（硬链接，启动新 LTK Manager 后清理） |
| `ltf_session.json` | 注入会话记录（崩溃恢复用） |
| `logs\ltk\ltk_launcher.log` | launcher 启动过程、注入失败原因 |

`config.json` 的读写统一走 `electron/utils/json-config.ts`：容忍 UTF-8 BOM、坏文件先备份成
`config.json.broken-<时间>` 再当空配置、写入「临时文件 + rename」。以前各模块自己
`JSON.parse(readFileSync(...))`，解析失败就返回 `{}` 再整份写回 —— 文件一带 BOM，用户的
`HERO_SKIN`（每个英雄上次选的皮肤）、皮肤目录后缀、游戏路径就会被一份只有默认值的配置覆盖。

---

## 8. 失败与恢复

| 情况 | 表现 | 处理 |
|---|---|---|
| 缺 `ltk_launcher.exe` / `LeagueToolFlop.dll` | 注入失败并提示 | 重装；或从 Rose 的 `_internal\injection\tools\` 拷到 `resources\ltf\` |
| 找不到 LTK Manager | 注入失败并提示 | 安装 LTK Manager，或 `config.json` 写 `LTK_MANAGER_PATH` |
| 用户已开着 LTK Manager（无桥） | 拒绝注入并提示关掉 | 关闭 LTK Manager（含托盘）后重试 |
| 桥 30s 没起来 | 提示 `LTF 桥没有起来` | 看 `logs\ltk\ltk_launcher.log`；多为 launcher 被杀软拦 |
| `MANAGER_ELEVATED` / `LEAGUE_ELEVATED` | 桥报错 | 取消 LTK/LOL 的管理员兼容设置 |
| 上一个 patcher 还在构建 | `ALREADY_RUNNING` | 自动 stop → 轮询到 idle → 重试一次 |
| 游戏已开始才注入 | 本局无效果 | 下一局生效 |
| 导入中途崩溃 | 残留 `.part` / 未登记文件 | 下次导入按大小判断覆盖；`.part` 不会被当成皮肤 |
| 退出清理超时（桥不应答） | 最多等 15 秒后强制结束 LTK Manager | 看日志 `[EXIT]`；未删掉的条目留在 `ltf_session.json`，下次启动补清 |
| 关程序后仍有 `ltk-manager.exe` | 见第 3.5 节 | 那是你手动开的实例，本程序不关；确认是残留就结束它，下次启动补清 |

---

## 9. 诊断顺序

1. 界面日志面板 + 控制台（`[LTF]` 前缀是本模块）。
2. `%LOCALAPPDATA%\lol-skin-ll\logs\ltk\ltk_launcher.log`：LTK 是否被拉起、PID、父进程。
3. `ltf_session.json` 是否残留（残留说明上次没正常收尾）。
4. LTK Manager 自己的日志（其安装目录/用户数据目录）。
5. 判断是否真的注入成功：注入后 LTK Manager 里应只有本次皮肤处于「启用」，
   其它模组被临时关掉；patcher 状态为 running。

---

## 10. 与 Rose 的关系

注入链路移植自 Rose 1.5（`native/ltf/` + `injection/tools/bridge.py`），差别在于：

| | Rose | 本项目 |
|---|---|---|
| 皮肤来源 | 自己的皮肤库 + 保存的模组 | LeagueSkins 整包 / 手工 zip |
| 会话模型 | 复杂 journal（saved mods、park、迁移） | 单会话 + `ltf_session.json` 最小恢复 |
| 触发时机 | 选人倒计时内自动注入 | 手动点「使用皮肤」 |
| 客户端集成 | Pengu Loader 插件（UI 内嵌） | 独立 Electron 界面 |

两边共用同一套「launcher 注入 DLL → 桥驱动 LTK Manager」的机制，因此 LTK Manager
的版本要求、管理员权限限制、patcher 行为都是一致的。
