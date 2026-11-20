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
| `electron/export/league-skins-import.ts` | LeagueSkins 导入：整包 zip / 本地文件夹（流式、去重、预检） |
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

1. `ensureSkinBuilt()`：确认 `skins\<suffix>\<heroId>\<heroId>_<n>.zip` 存在；
   **不存在就直接后台构建**（不再提示「请先下载英雄皮肤」）：
   - 主进程 `autoBuildSkin()` 调 `loadSkinDataByFile()`，日志不走页面日志抽屉
     （`setBuildLogSink` 把 `logData` 改到构建窗口），页面保持干净；
   - 进度和结果发到**侧边通知卡片**（`electron/hooks/build-window.ts` → `showProgressNotice`，
     和 `showSliderConfirm` 同一套卡片样式、同一个右上角通知队列和滑入/滑出动画，只是把按钮
     换成进度条）：标题、进度条、当前阶段、最近一条日志；成功显示「构建成功」2.5 秒后自动滑走，
     失败保留卡片并显示原因（右上角 × 可关）；
   - 工具环境没铺好、找不到英雄 WAD、构建报错都会在窗口里说清楚；
2. `f_loadSkin()` → 主进程 `loadSkin()`：
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

### 5.3 LeagueSkins 导入（整包 zip / 本地文件夹）

两种来源最终都落成同样的 `<heroId>/<heroId>_<n>.zip`，规则完全一致：

**整包 zip**（`importLeagueSkinsFromZip`）约 4~5 GB / 2 万条目，**不能整包读进内存**
（Node Buffer 上限 2 GiB）：

1. `ZipArchive.open()`：只读 EOCD/ZIP64 + 中央目录（本机实测 22244 条目解析 13ms）；
2. 筛 `.fantome`，按 `skins/<英雄>/<皮肤>/...` 解析出目标 `<heroId>/<heroId>_<n>.zip`；
3. 目标已存在时按内容判断：**大小和 CRC32 都与条目一致才跳过**（等价于覆盖，字节完全相同）；
   大小不同或 CRC 不同都覆盖成压缩包里的版本（压缩包是权威来源）；
4. 预检磁盘空间（留 2 GB 余量）；
5. 逐条流式解压：写 `.part` → 改名，单条失败只记失败。

**本地文件夹**（`importLeagueSkinsFromFolder`）用于已经解压好的仓库，省掉再压 4~5 GB zip：

1. `resolveLeagueSkinsFolder()` 只认两种选择：目录名是 `skins`，或所选目录下面有 `skins\`；
   选到英雄/皮肤子目录会直接报错，不会导出对不上号的条目；
2. 递归扫 `.fantome`（不跟符号链接），相对路径套用与 zip 相同的解析规则；
3. 目标比对、磁盘预检同上；复制走 `copyFile → .part → rename`，失败不会留下半个文件或破坏旧目标；
4. `skins\` 之外的东西（`classic\`、`README.md`、`.git\` 等）根本不会被扫描。

> 为什么不是无条件覆盖：整库 9000+ 皮肤，无条件重写每次要写 3~4 GB；
> 用 CRC 比对后，内容没变就只读不写（3.9 GB 校验约 4 秒），内容有变化仍然会覆盖。

比对这一步要把**源文件和目标文件都读完**才算得出 CRC，整库重复导入时是几 GB 的读取，
所以两条导入路径都会打实时进度（`createProgress`：每 500 项或每 2 秒一行，最后一项必打），
并且按 4 路并发比对（`mapLimit` + `DEDUPE_CONCURRENCY`）。日志形如：

```
[LeagueSkins文件夹导入] 扫描目录，查找 .fantome 文件…
[LeagueSkins文件夹导入] 扫描完成: 9155 个 .fantome 文件，用时 0.4 秒
[LeagueSkins文件夹导入] 比对已导入的皮肤（大小 + CRC32 一致才算重复，否则覆盖）…
[LeagueSkins文件夹导入] 校验已导入的皮肤 进度 3000/9143（32%），内容一致 2996 个，待覆盖 4 个，已用 3.1 秒
[LeagueSkins文件夹导入] 完成: 写入 2（覆盖 2），内容一致跳过 9141，失败 0，未识别 0/9155，用时 6.3 秒
```

`classic/`（经典模式）条目不在 `skins/` 结构里，会被跳过并计入「未识别」（文件夹导入只扫 `skins\`，
不会看到它们）。

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
> 建议先用「整包导入」或「从文件夹导入」落一批，之后只下增量。

---

## 6. 生成皮肤（可选功能）

> 生成流程、LTK skinhack 判定与「怎么让包通过」的完整说明见
> [SKIN-BUILD-AND-SKINHACK.md](SKIN-BUILD-AND-SKINHACK.md)（本节是它的摘要）。

只有「（多个）全部皮肤文件 /（一个）当前皮肤文件」这条路径会用到 cslol-tools：

```
游戏 wad (DATA/FINAL/Champions/<alias>.wad.client)
  └─ 定向解包（只取 skin<n>.bin）→ ritobin 批量转 py → 改皮肤 → ritobin 批量转 bin
     → wad-make.exe → <hero>_<n>.zip
```

工具目录（`MOD_TOOLS_PATH` 的父目录）需要 `wad-make.exe`、`wad-extract.exe`、
`ritobin\bin\ritobin-tools.exe`、`skinbins-index.txt`（皮肤 bin 索引）。
**注入本身完全不需要它。**

### 6.0 工具环境：工具随安装包走（`resources\tools`）

工具就是仓库里的 `native/tools`（15 个文件 / 19.2 MB），打包时由 electron-builder 的
`extraResources` 原样拷到 `<安装目录>\resources\tools`：

```
native/tools/                ← 直接进 git，不是构建产物
  ├─ wad-make.exe / wad-extract.exe / mod-tools.exe / cslol-* / ltk_patcher_*
  ├─ ritobin\bin\ritobin-tools.exe + hashes\{binfields,bintypes}.txt
  └─ skinbins-index.txt      ← 22662 条「皮肤 bin 路径 + WAD 路径哈希」，1.32 MB
```

两个大文件**故意不带**：

| 文件 | 大小 | 为什么不要 |
| --- | --- | --- |
| `hashes.game.txt` | 219 MB | 只用来筛「皮肤 bin 的路径 + 哈希」，结果就是随包的 `skinbins-index.txt`；游戏更新时用 `npm run index:gen` 重新生成 |
| `ltk-manager.exe` | 95 MB | 注入用系统安装的 LTK Manager（`%ProgramFiles%\LTK Manager`），找不到才提示安装 |

开发时 `resolveToolsDir()`（`electron/utils/tools-path.ts`）用 `native/tools`，打包后用
`resources\tools`。所以「设置 → 工具环境」只看状态，**不需要点任何「初始化」**：程序启动时
`ensureToolsConfigured()`（`electron/export/tools-env.ts`）会把 `MOD_TOOLS_PATH` 指到随包那份。

- 只会改「空的 / 旧的 `%LOCALAPPDATA%\lol-skin-ll\tools\mod-tools.exe`」这类我们自己的路径；
  用户自己填的、文件还在的 cslol-tools 目录不动。
- **用户数据位置没变**：`config.json`、`skins\`、`overlays\` 仍然在 `%LOCALAPPDATA%\lol-skin-ll`。
- `getToolsEnvStatus()` 用 mod-tools / wad-make / wad-extract / ritobin-tools / skinbins-index.txt
  这 5 个文件判断工具目录是否完整。

> 打包：`electron-builder.json5` 的 `extraResources` 把 `native/tools` 拷到 `resources/tools`
> （外部 exe 不能塞进 asar）。
>
> 注入用的 `ltk_launcher.exe` / `LeagueToolFlop.dll` 由 `extraResources` 放到 `resources/ltf`；
> 那份缺了的话 `resolveLtfDir()` 退回 `resources\tools`。

#### 6.0.1 游戏更新后：重新生成皮肤索引

`hashes.game.txt` 会随游戏版本更新（新英雄、新皮肤都在里面）。随包的 `skinbins-index.txt`
是它的「只含皮肤 bin」子集（文件头记着生成时间、来源和条数），所以游戏大版本更新后要重跑：

1. 拿到新的 `hashes.game.txt`：cslol-manager 的 cslol-tools 包，或者旧工具目录里那份被更新后；
2. `npm run index:gen -- <hashes.game.txt 或它所在目录>`
   （不给参数时会在 `%LOCALAPPDATA%\lol-skin-ll\tools` 和仓库 `.tmp` 里找）；
   输出形如 `22662 条 / 1.32 MB`，还会列出「相比上一版：新增 N 条，删除 M 条」；
3. `npm run wadindex:test`，再随便构建一个皮肤确认；
4. 重新打包（`npm run app:build`）。

`hashes.lcu.txt` 不用管：那是客户端（LCU）路径的名字表，皮肤 bin 用不到它。

程序日志里出现下面这些，就是索引该更新了：

- `不在皮肤索引里（索引可能过期：npm run index:gen）`
- `没解出任何皮肤 bin：皮肤索引可能过期`
- `skin<N>（往上找了 50 个 id 都没有 bin）`

### 6.1 为什么能快（单个皮肤 19 s → 0.5 s）

原来一个皮肤要 10~19 秒，慢在两处，都不是「干活」本身：

| 步骤 | 原来 | 现在 | 原因 |
| --- | --- | --- | --- |
| 解包英雄 WAD | 5.6 s | 0.05 s | `wad-extract.exe` 把 144 MB 全解开（503 MB 落盘）再删，其实只要 4 个 bin |
| ritobin 转 bin→py | 4 × 3.1 s | 0.07 s | 老 `ritobin_cli` 每次启动都读 `hashes\hashes.game.txt`（219 MB）建名字表，还转不了 16.21 之后的 bin；换成 `ritobin-tools` 0.2.3 后按需读表，12 个 bin 一次 69 ms |
| ritobin 转 py→bin | 2 × 0.02 s | 0.02 s | 反向不需要名字表 |
| 网格/bank/语音/打包 | ~0.15 s | ~0.15 s | 本来就不慢 |

**定向解包**（`electron/export/wad-index.ts`）：WAD 目录里只有路径哈希，所以

1. 候选路径来自随包的 `skinbins-index.txt`：所有 `data/characters/<角色>/skins/skin<n>.bin`
   连同 WAD 路径哈希（22662 条 / 1.32 MB，是从 219 MB 的 `hashes.game.txt` 里筛出来的，
   用 `npm run index:gen` 重生成）—— 读一次几十毫秒，不再每次解析名字表；
2. 读 WAD 的 chunk 表（只读前 100 KB，`readWadChunkHashes`），命中索引里哪些哈希 =
   这个 WAD 里有哪些皮肤 bin；
3. 只把这些 bin 取出来（`extractWadFiles`，保留原相对路径，不同角色的 `skin0.bin` 不打架）。

不做「按英雄名猜角色目录」的过滤：安妮的 WAD 里还有 `annietibbers`、`jade_annie_tibbers`，
名字里不含完整英雄名，猜会漏条目。查不到任何 bin 时退回全量解包，行为与以前一致。

**ritobin-tools 批量 + 精简名字表**（`electron/export/ritobin.ts`）：换成 LeagueToolkit 的
`ritobin-tools` 0.2.3 之后，调用方式也变了：

```
bin→py：ritobin-tools -H <精简表> --hashtable-dir <空目录> convert <目录> -r --ext py
py→bin：ritobin-tools convert <目录> -r --to bin
```

- `-H` 指向临时目录里的精简表（只含 15 个「我们改写要用到的字段名」，三个固定文件名
  `hashes.binfields/bintypes/binentries.txt` 各写一份）。没列进去的名字照旧是 `0x...`
  哈希 —— bin 里本来就是哈希，转回 bin 后字节完全一致（Jade_Vayne Skin11 234728 B、
  Ahri skin0/skin100 都验证过逐字节相同，新旧工具对同一份文本产出的 bin 也一模一样）。
- `--hashtable-dir` 指向一个空目录：新工具默认读 LTK 共享缓存
  （`%LOCALAPPDATA%\LeagueToolkit\hashes`，约 58 MB）。装了 LTK Manager 的机器会解出
  所有名字、没装的全是哈希，同一份 bin 转出来的文本就不一样。指到空目录后行为统一。
- 游戏改了字段名、锚点解不出来时，`convertBinsToPy` 会删掉这批 py，改用随包那份完整表
  （`ritobin\bin\hashes`）重转一次，保证正确性优先。

缓存都在系统临时目录 `%TEMP%\lol-skin-cache\`（纯派生物，不碰用户数据）：
皮肤 bin 索引、每个 WAD 的探测结果。实测 Vayne Skin11：冷启动 1.3 s、之后 0.46 s。

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
   （`<英雄>_Skin<n>_SFX`）和非 voiceOver 单位的事件名，这些名字留在包里就还是 skinhack。
   > 事件名有**两种**写法，都要换：`Play_sfx_<tag>_…`（tag 在第三段，例如
   > `Play_sfx_AkaliSkin102_Idle1`）和状态类 `Play_<tag>_<状态>` / `Switch_<tag>_<状态>`
   > （tag 在第二段，例如 `Play_AkaliSkin102_Attack1_To_Idle`、`Switch_AkaliSkin102_Footsteps_Brush`）。
   > 只按段位置取第三段的话，后者会漏掉 —— Akali skin102 的包就是这样被 LTK 拒的
   > （见 §8「挂载被拒」），现在用 `otherSkinSegment()` 按段找 `<英雄>skin<n>` 标记。

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

语音（voiceOver）：语音 bank 是**语言相关**的（放在 `<英雄>.zh_CN.wad.client` 这类语言
WAD 里，路径里带 `VO/en_US/`），mod 不可能把所有语言都装进来，所以不能改它。做法是
建一个**语言无关的 sidecar bank**（`..._VO_basetag_events.bnk`，路径里去掉语言目录，
随英雄 WAD 走），里面放语音事件的 base 名字别名，并把源事件的 **Action 对象复制进去**
（Event 不能指向别的 bank 的 Action，bank 是各自加载的）。Action 沿用源 bank 的 id，
所以客户端加载哪个语言的语音 bank，声音都找得到；bin 里语音单位的 `bankPath` 追加这个
sidecar 路径。同一份皮肤的几个角色（Vayne / jade_vayne）共用一个 sidecar，别名累计。

音效核对方式：`%TEMP%\harness\check-ltk.mjs`（离线复刻 patcher 的检查）、
`check-audio.mjs`（单位列的事件都能被包里的 bank 解析）、`check-alias-actions.mjs`
（别名指向的 Action 与游戏原始 bank 一致）、`check-voice.mjs`（语音 sidecar 的别名
与语言 WAD 里原始事件一致）。

还没做的另一步：把 48 个内嵌 VFX 条目精简掉（Rose 输出只留 `Skin0` + `Resources` 两个条目），
不影响 LTK 的检查。

#### 生成后的名字检查（不合格就不注入）

每生成一个皮肤，打包前会用 `electron/export/skin-check.ts` 跑一遍 **LTK 的 skinhack 名字检查**
（规则同 `bin_skinhack/mod.rs`：`ChampionSkinName` / `TagEventList` / `BankUnits[].Name` /
非 voiceOver 单位的事件名里出现 `<英雄>skin<n>`，n≠0；base 皮肤自己也列的事件不算）。
只是字符串扫描，5 MB 的 bin 文本约 **0.2 ms**，所以放在生成流程里没有成本。

- 结果写到 zip 旁边：`<hero>_<n>.zip.check.json`（`{ ok, champion, checkedAt, problems }`）；
- 生成的包不合格：日志里会有一行 `[检查] 84_102 会被 LTK 判 skinhack（N 处）：…`；
- **注入前**（`electron/export/index.ts` 的 `injectSkin`）会读这个文件，`ok=false` 就直接
  不加载，提示「会被 LTK 判 skinhack，请换一个皮肤或重新生成」；「加载全部皮肤」也会跳过它；
- 没有 `.check.json` 的老包（旧版本生成的）不拦，照旧尝试；`autoBuildSkin` 发现上次的包
  没通过检查会自动重新生成。


---

## 7. 数据目录一览

`%LOCALAPPDATA%\lol-skin-ll`：

| 路径 | 用途 |
|---|---|
| `config.json` | 所有设置（`GAME_PATH`、`SKIN_PATH`、`MOD_TOOLS_PATH`、`LTK_MANAGER_PATH`…） |
| `skins\<suffix>\<hero>\*.zip` | 皮肤文件 |
| `overlays\<hero>_<skin>\` | 「皮肤使用中」的记录目录（不存 wad） |
| `overlay.json` | 当前应用到「皮肤使用中」的皮肤 id 列表 |
| `mod-tools\` | 旧版「初始化配置环境」的解压目录（新版不用了，确认没在用可以直接删，约 560 MB） |
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
| 找不到 LTK Manager | 注入失败并提示 | 装 LTK Manager（不再随包；装好会自动探测） |
| 工具环境缺文件 | 构建窗口提示缺哪几个 | 重新安装本程序（工具在 `resources\tools`，不用手动初始化） |
| 用户已开着 LTK Manager（无桥） | 拒绝注入并提示关掉 | 关闭 LTK Manager（含托盘）后重试 |
| 桥 30s 没起来 | 提示 `LTF 桥没有起来` | 看 `logs\ltk\ltk_launcher.log`；多为 launcher 被杀软拦 |
| `MANAGER_ELEVATED` / `LEAGUE_ELEVATED` | 桥报错 | 取消 LTK/LOL 的管理员兼容设置 |
| 上一个 patcher 还在构建 | `ALREADY_RUNNING` | 自动 stop → 轮询到 idle → 重试一次 |
| 游戏已开始才注入 | 本局无效果 | 下一局生效 |
| 导入中途崩溃 | 残留 `.part` / 未登记文件 | 下次导入按大小判断覆盖；`.part` 不会被当成皮肤 |
| 退出清理超时（桥不应答） | 最多等 15 秒后强制结束 LTK Manager | 看日志 `[EXIT]`；未删掉的条目留在 `ltf_session.json`，下次启动补清 |
| 关程序后仍有 `ltk-manager.exe` | 见第 3.5 节 | 那是你手动开的实例，本程序不关；确认是残留就结束它，下次启动补清 |
| 进游戏没换肤、overlay 被关 | LTK 日志 `overlay verification failed, disabling overlay: base-skin check: skin0 is another skin: SkinAudioProperties.BankUnits.Events names <英雄>Skin<n>`，同目录 `incidents\*.json` 里 `verdict.kind = skinhack-detected` | 包里还留着别的皮肤的事件名（Akali skin102 就是 `Play_AkaliSkin102_Attack1_To_Idle` 这类**状态类**事件漏改）。现在生成时会跑 §6.1 的名字检查、不合格直接不注入；按提示重新生成，仍报就把日志里的事件名发出来 |

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
| 皮肤来源 | 自己的皮肤库 + 保存的模组 | LeagueSkins 整包 / 文件夹导入 / 手工 zip |
| 会话模型 | 复杂 journal（saved mods、park、迁移） | 单会话 + `ltf_session.json` 最小恢复 |
| 触发时机 | 选人倒计时内自动注入 | 手动点「使用皮肤」 |
| 客户端集成 | Pengu Loader 插件（UI 内嵌） | 独立 Electron 界面 |

两边共用同一套「launcher 注入 DLL → 桥驱动 LTK Manager」的机制，因此 LTK Manager
的版本要求、管理员权限限制、patcher 行为都是一致的。
