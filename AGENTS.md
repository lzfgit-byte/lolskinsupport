# 给 AI / 协作者的操作约定

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
