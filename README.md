# lolskinsupport

英雄联盟换肤工具（Electron + Vue）。选皮肤 → 通过 **LTK Manager** 把皮肤应用到游戏里；
支持 LeagueSkins 整包导入、按英雄挑选皮肤、一键启动游戏。

- 使用准备：本文下面的第一章
- 工作原理与排障：[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)

---

## 一、新电脑使用准备（Checklist）

### 最小可跑：3 样东西

只要这三样就能换肤（**不再需要** cslol-tools，也不需要自己准备 `ltk_patcher_host.exe`）：

| # | 准备项 | 说明 |
|---|---|---|
| 1 | **英雄联盟** | 含 Riot Client。用于读取皮肤资源、启动游戏 |
| 2 | **LTK Manager** | 注入器。下载：<https://github.com/LeagueToolkit/ltk-manager/releases/latest>，默认装到 `C:\Program Files\LTK Manager` |
| 3 | **lolskinsupport 程序** | 安装包或解压后的程序目录（内含 `resources\ltf\ltk_launcher.exe` 与 `resources\ltf\LeagueToolFlop.dll`）|

### 还需要：皮肤文件（二选一）

- **整包导入**：拿一份 LeagueSkins 整包（结构为 `skins/<英雄ID>/<皮肤ID>/<皮肤ID>.fantome`），
  在「设置 → 导入 LeagueSkins 整包」里选这个 zip。整包通常 **4~5 GB**，导入后占 **约 4 GB** 磁盘，
  耗时几十秒。重复导入时按内容比对：**大小或 CRC32 不一致的会覆盖**，只有完全相同的才跳过。
- **手工放置**：把皮肤按 `<皮肤目录>\<英雄ID>\<英雄ID>_<序号>.zip` 放好
  （例如 `...\skins\wad_skins\1\1_1.zip` 是安妮的 1 号皮肤）。

> 整包里的 `classic/` 条目（经典模式皮肤）会被自动跳过——本程序目前只支持常规模式。

### 只有「自己生成皮肤」才需要：cslol-tools

程序本身不打包这套工具，也不带自动下载。要用「（多个）全部皮肤文件 /（一个）当前皮肤文件」
从游戏 WAD 里生成皮肤时，准备一个工具目录，里面至少要有：

```
mod-tools\
├── mod-tools.exe
├── wad-make.exe
├── wad-extract.exe
├── hashes.game.txt
└── ritobin\bin\ritobin_cli.exe
```

来源：<https://github.com/LeagueToolkit/cslol-manager>（cslol-manager 的 cslol-tools 目录）。
在「设置 → toolsPath」里选中 `mod-tools.exe` 保存即可（默认位置 `%LOCALAPPDATA%\lol-skin-ll\mod-tools\mod-tools.exe`）。

### 首次启动建议配置

打开「设置」，确认这几项（没设过会落在默认值）：

| 配置 | 默认值 | 用途 |
|---|---|---|
| 游戏路径 `GAME_PATH` | `E:\game\Riot Games\League of Legends\Game` | 读英雄 WAD、启动游戏 |
| 皮肤目录 `SKIN_PATH` | `%LOCALAPPDATA%\lol-skin-ll\skins` | 皮肤文件放这里 |
| 工具目录 `MOD_TOOLS_PATH` | `%LOCALAPPDATA%\lol-skin-ll\mod-tools\mod-tools.exe` | 仅生成皮肤时用到 |
| Riot 客户端 `RIOT_CLIENT_PATH` | 自动推断 | 一键启动游戏（可选） |

**LTK Manager 路径不用配**：程序按 `C:\Program Files\LTK Manager`、`%LOCALAPPDATA%\LTK Manager`、
`%LOCALAPPDATA%\Programs\LTK Manager` 自动查找；装在别处时在 `config.json` 里加一项
`"LTK_MANAGER_PATH": "D:\\...\\ltk-manager.exe"` 即可。

### 运行环境注意事项

- **Windows 10/11 x64**；英雄联盟能在这台机器上正常启动。
- 以**普通权限**运行本程序即可；**英雄联盟和 LTK Manager 都不要设成「以管理员身份运行」**，
  否则 LTK 的 patcher 会拒绝（提示 `LEAGUE_ELEVATED` / `MANAGER_ELEVATED`）。
- 注入前**不要自己开着 LTK Manager**：程序会自己以隐藏方式启动一个带桥的实例，结束时再关掉。
  已经开着的会被拒绝（提示先关掉，托盘里也要退出）。
- **关掉本程序（点窗口 X / 结束进程）时会自动收尾**：停 patcher、撤掉本次皮肤、把你自己在
  LTK Manager 里开的模组恢复，并关掉本程序启动的那个 LTK Manager —— 不会留一个「Profile
  Patched」的托盘图标。你自己手动打开的 LTK Manager 不会被关。
- 反过来说，**游戏进行中关掉本程序，本局皮肤会失效**（patcher 被停掉了，和 Rose 一样）。
  想继续用皮肤就别关程序；下一局前重新点「使用皮肤」即可。
- 首次加载英雄/皮肤名称与图片需要联网。
- 杀毒软件可能隔离 `ltk_launcher.exe` / `LeagueToolFlop.dll`（它们要注入进程），
  如果提示缺少这两个文件，先看隔离区。

---

## 二、文件都放在哪

程序数据目录：`%LOCALAPPDATA%\lol-skin-ll`

| 路径 | 内容 | 谁创建 |
|---|---|---|
| `config.json` | 所有设置项（见上表） | 程序自动 |
| `skins\` | 皮肤压缩包（`.zip`，内部是 `.fantome` 结构） | 你导入 / 手工放 |
| `overlays\` | 「皮肤使用中」的记录目录（不再存 wad） | 程序自动 |
| `mod-tools\` | cslol-tools（仅生成皮肤） | 你提供 |
| `logs\ltk\ltk_launcher.log` | LTK Manager 启动日志（排查注入问题看这里） | 程序自动 |
| `ltf_staging\` | 导入 LTK Manager 前的暂存包（会自动清） | 程序自动 |
| `ltf_session.json` | 注入会话记录；正常退出会删掉，崩溃残留的下次启动补清 | 程序自动 |

程序安装目录下的 `resources\ltf\` 必须有 `ltk_launcher.exe` 和 `LeagueToolFlop.dll`——这两个
文件把桥注入 LTK Manager，是整个注入链路的入口。

---

## 三、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 提示「缺少 ltk_launcher.exe / LeagueToolFlop.dll」 | 安装包不完整或被杀软隔离：重装，或从 Rose 安装目录 `_internal\injection\tools\` 拷到 `resources\ltf\` |
| 提示「LTK Manager 已经开着，但它里面没有 Rose 的桥」 | 关闭 LTK Manager（含托盘图标）后重试 |
| 提示 `MANAGER_ELEVATED` / `LEAGUE_ELEVATED` | 取消 LTK Manager / 英雄联盟的「以管理员身份运行」 |
| 注入成功但游戏里没变化 | 皮肤只对**注入之后新开的一局**生效；重开一局（或换皮肤后重开） |
| 导入整包报「空间不足」 | 导入前会检查磁盘，需要约 4 GB 余量；换个皮肤目录到空间大的盘 |
| 导入后英雄页看不到皮肤 | 确认文件在 `skins\<皮肤目录>\<英雄ID>\<英雄ID>_<序号>.zip`；「皮肤使用中」只列点过「使用皮肤」的 |
| 关掉程序后 LTK Manager 还在跑 | 正常情况不会：退出时会先停注入再关掉它。若用的是「你自己先开的」LTK Manager，本程序不会关它；真遇到残留，退出后用任务管理器结束 `ltk-manager.exe` / `ltk_patcher_host.exe`，下次启动会自动补清上次没撤掉的皮肤 |

---

## 四、从源码构建（开发者）

```powershell
# 环境：Node.js 22+、npm
npm install

# 开发（Vite + Electron 热更新）
npm run app:dev

# 打包（产物在 release\<version>\）
npm run app:prebuild
```

### LTF 桥（注入用的两个原生文件）

`native\ltf\` 里是 vendored 的 LeagueToolFlop 源码，构建产物放 `native\ltf\build\`：

```powershell
npm run ltf:build     # 需要 MSVC x64（VS「使用 C++ 的桌面开发」）
```

没有 MSVC 时，可以直接取 Rose 安装目录里的现成文件：

```
D:\Program Files\Rose\_internal\injection\tools\ltk_launcher.exe
D:\Program Files\Rose\_internal\injection\tools\LeagueToolFlop.dll
```

拷到 `native\ltf\build\` 即可（打包时会被放到 `resources\ltf\`）。

### 测试

```powershell
npm run ltf:test          # 桥协议（假桥服务器，不依赖本机环境）
npm run ltf:session:test  # 真机：驱动 ltfInjector 完成一次注入并清理
npm run zip:test          # 流式 ZIP 读取（含 >2 GiB 与真实整包）
npm run import:test       # LeagueSkins 整包导入（落盘/去重/覆盖）
```

---

## 免责声明

本项目与 Riot Games 无关。使用自定义皮肤存在账号风险，后果自负。
