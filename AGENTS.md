# 给 AI / 协作者的操作约定

## 〇、改哪里：只有 lolskinsupport，Rose 只是参考

- 这个会话里的**所有代码修改都落在 `D:\projects\lolskinsupport`**；这就是我们的项目。
- `D:\projects\Rose`（以及安装目录 `D:\Program Files\Rose`）**只是参考实现**：
  可以去读、去 `git log/show/diff`、对照它的逻辑，但**不要修改它**、不要提交、不要动它的工作区。
- 从 Rose 抄逻辑时：移植到 TS 并适配本项目的目录结构 / 配置，注释里写清「对应 Rose 的哪个文件/提交」，
  不要把 Rose 的 Python 代码或运行时文件直接放进本项目。

## 一、用户数据：未经我确认，一律不许动

`%LOCALAPPDATA%\lol-skin-ll\` 是用户的真实数据，**不是测试场地**：

| 路径 | 内容 |
|---|---|
| `config.json` | 所有设置：游戏/皮肤/工具路径、皮肤目录后缀、**每个英雄上次选的皮肤（`HERO_SKIN`）**、语言监听、截图配置 |
| `overlay.json`、`overlays\` | 「皮肤使用中」记录 |
| `skins\` | 皮肤压缩包（3.9 GB，用户自己导入的） |
| `logs\` | 日志 |

规则：

1. **没有用户明确同意（一句「可以」），禁止写入、覆盖、删除、移动上面任何文件或目录。**
2. 确实需要改用户配置时，先说明四件事再动手：改哪个文件、改成什么、为什么、怎么回滚。
3. 写配置必须 **UTF-8 无 BOM**、先备份（`*.before-<原因>`）。不要用 PowerShell 5.1 的
   `Set-Content -Encoding UTF8`（会加 BOM，`JSON.parse` 直接抛异常）。
4. 测试 / 验证 / 复现一律用隔离数据目录（临时目录，或程序支持的数据目录环境变量），
   **绝不能指向真实的 `lol-skin-ll`**；测试里要用皮肤，复制一份到临时目录。
5. 「清理」「收尾」只允许动本程序自己创建的东西：本次导入的模组、自己启动的 LTK Manager、
   自己产生的临时文件。用户手动应用过的模组、历史记录，不在清理范围内。
6. 涉及默认值、清理/删除逻辑的代码改动，先说明影响再改。

## 二、已经踩过的坑（2026-11-15）

- 用 PowerShell 5.1 的 `Set-Content -Encoding UTF8` 写了带 BOM 的 `config.json`；
  `locale-watcher` 里的 `readConfig()` 解析失败返回 `{}`，紧接着 `setConfig()` 把整份配置
  覆盖成只剩 `LOCALE_WATCHER_ENABLED` —— 用户的 `HERO_SKIN`（165 个英雄的上次选择）、
  皮肤目录后缀、游戏路径全部丢失，表现为「明明有皮肤却提示请先下载英雄皮肤」「历史选中不回显」。
- 恢复方式：测试前 dump 过完整 `config.json` 快照，已按快照写回（UTF-8 无 BOM）。
- 代码修复已接线（2026-11-15）：`electron/utils/json-config.ts` 是唯一允许的配置读写入口
  （`readJsonConfig` / `writeJsonConfig` / `patchJsonConfig`）。新增代码**不要**再写
  `JSON.parse(readFileSync(configPath))` 或 `writeFileSync(configPath, ...)`。
  测试：`npm run config:test`。

## 三、base-skin / LTK 检查（2026-11-18）

- LTK 的 patcher 认 base 皮肤要过两道：**网格内容**和**名字**。规则在 LTK 的
  `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`（本机在
  `%TEMP%\ltk-src`，只读参考）。
- **补 16 个 0 字节没用**：patcher 比较「是不是别的皮肤的网格」时按对方文件的长度比前缀，
  追加的尾巴被忽略。必须真改内容 —— 我们的做法（照 Rose 1.5.9）是骨架加 `null_bone` 关节、
  网格加末顶点拷贝，见 `electron/export/skin-mesh.ts`。
- 名字也要换：`ChampionSkinName`、`TagEventList`、`BankUnits[].Name`、非 voiceOver 单位的
  事件名，见 `electron/export/skin-audio.ts`。
- 音效别名（保住皮肤专属音效）：`electron/export/skin-banks.ts` 在皮肤自己的事件 bank 里
  补 base 名字的别名 Event，并删掉 base 事件 bank 里同 id 的 Event；bank 读写是
  `electron/export/bnk.ts`（照 Rose 的 `bnk.py`，没改过的 bank 必须逐字节写回）。
  bank 不搬到 base 路径（省体积），所以包里只多两个十几 KB 的事件 bank。
- 语音别名：语音 bank 在**语言 WAD**（`<英雄>.zh_CN.wad.client`）里，不能改，所以建一个
  语言无关的 sidecar bank（`..._basetag_events.bnk`，`flushSidecars` 统一产出），
  里面复制源事件的 Action、放 base 名字的别名；同一份皮肤的几个角色共用一个 sidecar
  （`createSidecarRegistry` 由调用方持有）。
- 改源文件**不要**用 PowerShell 的 `Get-Content`/`Set-Content` 改写（会把 UTF-8 读成 ANSI，
  整篇变乱码、中文串破坏语法）；用编辑工具或 `write`。
- 改完重建包后，可以先用 `%TEMP%\harness\check-ltk.mjs`（离线复刻检查规则）验证，再去游戏里试；
  音效再用 `check-audio.mjs`（事件都有 bank 提供）、`check-alias-actions.mjs`（别名 Action 一致）。
- 测试：`npm run mesh:test`、`npm run audio:test`、`npm run bnk:test`、`npm run banks:test`、
  `npm run rebase:test`。

## 四、生成皮肤的性能坑（2026-11-19）

单个皮肤从 19 s 压到 0.5 s 的关键，别改回去：

- **`ritobin_cli` 每次启动读 219 MB 名字表**（`ritobin\bin\hashes\hashes.game.txt`）：
  5 KB 的 bin 也要 3.3 s，1 字节的只要 10 ms。所以 bin→py 必须**批量**
  （`-r -i bin <目录>`，`electron/export/ritobin.ts`），再配 `-d` 精简名字表。
- `-d` **只认 `hashes.binfields.txt` / `hashes.bintypes.txt` / `hashes.binentries.txt`
  这几个固定文件名**（`hashes.other.txt`、`hashes.txt` 会被忽略，实测），所以同一份内容写三份。
- 精简表 = 「我们改写会用到的名字」（`RITOBIIN_NAMES`）。少写一个就会出现「字段没被改名」
  这类静默错误（踩过：漏了 `championSkinId`，生成的 bin 与旧流程差 9 字节，LTK 可能判 skinhack）。
  改完一定要和旧流程比 **WAD 条目内容**（不是 zip 字节：zip 带时间戳会变）。
- **不要按英雄名猜角色目录**：安妮 WAD 里有 `annietibbers`、`jade_annie_tibbers`，猜会漏条目。
  `wad-index.ts` 的做法是拿 `hashes.game.txt` 里的皮肤 bin 索引 × WAD chunk 表求交集。
- 英雄 WAD 不用 `wad-extract.exe` 全解开（144 MB → 503 MB 落盘）。定向解包只要几十 KB，
  查不到就回退全量解包。
- 缓存都在 `%TEMP%\lol-skin-cache\`（纯派生物，别挪到用户数据目录）。
- 测试：`npm run ritobin:test`、`npm run wadindex:test`。

## 五、工具环境与自动构建（2026-11-19）

- 工具跟着安装包走：`native/tools` **直接进 git**（15 个文件 / 8.1 MB），
  `electron-builder.json5` 的 `extraResources` 把它拷到 `<安装目录>\resources\tools`。
  运行时用 `electron/utils/tools-path.ts` 的 `resolveToolsDir()` 找它（开发时是 `native/tools`）。
  **不需要用户点「初始化配置环境」了**：启动时 `ensureToolsConfigured()`
  （`electron/export/tools-env.ts`）把 `MOD_TOOLS_PATH` 指到随包那份，只迁旧的
  `%LOCALAPPDATA%\lol-skin-ll\tools\...`；用户数据位置（config.json / skins / overlays）没变。
- 工具里**不带**两个大文件（历史原因见下）：
  - `hashes.game.txt`（219 MB）：只用它筛「皮肤 bin 路径 + WAD 路径哈希」，结果就是随包的
    `skinbins-index.txt`（21446 条 / 1.25 MB）。读索引统一用 `resolveSkinBinIndexPath()`；
    游戏更新新增皮肤后，用 `npm run index:gen` 从新的 `hashes.game.txt` 重新生成。
  - `ltk-manager.exe`（95 MB）：注入用系统安装的 LTK Manager（`%ProgramFiles%\LTK Manager`），
    找不到才提示安装，不再随包带。
- `ritobin\bin\hashes\` 只留 `binfields` + `bintypes` 两张表：15 个改写锚点全在里面；
  没解出来的名字在 py 里保持 `0x...` 哈希形式，转回 bin 还是同一个哈希（输出不变）。
- `skinbins-index.txt` 文件头是 `# skinbins-index / # source / # generated` 三行注释，
  解析时跳过（`buildSkinBinIndex`、`parseHashesFile` 都跳过 `#`）。游戏更新出新英雄/新皮肤后：
  `npm run index:gen -- <新的 hashes.game.txt 或目录>` → 看「新增 / 删除」条数 →
  `npm run wadindex:test` → 构建一个皮肤验证 → 重新打包。`hashes.lcu.txt` 是 LCU 路径的
  名字表，皮肤 bin 用不到，不用管。日志里出现「索引可能过期」就是该重跑了。
- `extraResources` 而不是 `asarUnpack`：这些是外部 exe，要按普通文件路径执行，不能塞进 asar。
  别再把工具放进 `public/`（会被 vite 复制进 `dist` 再打进 asar，白白多一份）。
- **皮肤 id 有两种写法**：列表里是 `<heroId><序号>`（JarvanIV 的 `59005`），生成时要的是序号
  `5`（游戏里是 `skin5.bin`）。换算统一用 `electron/export/skin-id.ts` 的 `toSkinIndex()`；
  以前「没皮肤直接构建」把 59005 直接当序号传下去，扫了 50 个 id 都没找到、最后什么都没生成
  （手动「当前皮肤文件」走的是正确换算，所以能成功）。
- 打 zip 别用 `Compress-Archive`（慢、压不干净）；用 .NET
  `ZipFile.CreateFromDirectory(..., CompressionLevel.Optimal, ...)`，先把文件用硬链接放进暂存目录。
- 「没皮肤就直接构建」：渲染进程 `ensureSkinBuilt()` → 主进程 `autoBuildSkin()`。
  构建日志用 `setBuildLogSink()` 改道到构建窗口，**不要**再往页面日志抽屉灌（后台静默）。
- 构建进度提示：`electron/hooks/build-window.ts` → `showProgressNotice()`
  （`use-confirm-window.ts` 里，和 `showSliderConfirm` 共用右上角通知队列、卡片样式和滑入动画，
  只是把按钮换成进度条）；页面 HTML 在 `export-progress-html.ts`，通过 `require('electron')`
  收 `build-progress` 更新。进程内只保留一个通知。
- 自测：`native/tools` 应有 15 个文件；打包验证用
  `npx electron-builder --dir`，看 `release\<版本>\win-unpacked\resources\tools\mod-tools.exe`
  在不在（旧的 `public/tools` + `tools.zip` 方案已经废弃）。
