# 独立皮肤应用工具 (Standalone Skin Applier)

## 概述

`standalone-skin-applier.ts` 是一个完全独立的 TypeScript 脚本，用于生成和应用 League of Legends 皮肤。它整合了项目的核心逻辑，但不依赖 Electron 或其他项目组件。

## 功能

1. **生成皮肤文件** - 从 WAD 文件生成 .fantome 皮肤文件
2. **应用皮肤到游戏** - 通过 mkoverlay 和 patcher 将皮肤应用到游戏
3. **完整流程** - 一键生成和应用

## 前置条件

### 1. 外部可执行文件

脚本需要以下两个文件（在使用前必须准备好）：

```
D:\ltk-manager.exe          (Bocchi overlay 工具)
D:\cslol-dll.dll           (League 客户端修改 DLL)
```

如果文件位置不同，请编辑脚本中的 `CONFIG` 对象：

```typescript
const CONFIG = {
  LTK_MANAGER_PATH: 'd:/ltk-manager.exe',  // 修改这里
  CSLOL_DLL_PATH: 'd:/cslol-dll.dll',      // 修改这里
  TEMP_BASE: path.join(os.tmpdir(), 'bocchi-skin-applier')
}
```

### 2. Node.js 和 TypeScript

```bash
node >= 16.0
npx ts-node >= 10.0
```

## 使用方式

### 显示帮助信息

```bash
npx ts-node scripts/standalone-skin-applier.ts --help
```

### 命令 1: 生成皮肤文件

```bash
npx ts-node scripts/standalone-skin-applier.ts generate \
  --wad "C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Ahri.wad.client" \
  --champion Ahri \
  --skins 0,1,2,3 \
  --output "./generated_skins"
```

**参数说明：**
- `--wad, -w`：WAD 文件路径（必需）
- `--champion, -c`：英雄名称（必需）
- `--skins, -s`：皮肤 ID 列表，用逗号分隔（默认: 0）
- `--output, -o`：输出目录（默认: ./output）
- `--author, -a`：作者名称（默认: Bocchi）

**输出示例：**
```
[12:34:56] [INFO] 开始生成皮肤文件...
[12:34:56] [INFO] WAD 文件: C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Ahri.wad.client
[12:34:56] [INFO] 英雄: Ahri
[12:34:56] [INFO] 皮肤 IDs: 0,1,2,3
✓ 皮肤 #0 生成成功: ./generated_skins/Ahri_Skin0.fantome (25.3MB)
✓ 皮肤 #1 生成成功: ./generated_skins/Ahri_Skin1.fantome (24.8MB)
✓ 皮肤 #2 生成成功: ./generated_skins/Ahri_Skin2.fantome (26.1MB)
✓ 皮肤 #3 生成成功: ./generated_skins/Ahri_Skin3.fantome (25.5MB)
✓ 成功生成 4 个皮肤文件
```

### 命令 2: 应用皮肤到游戏

```bash
npx ts-node scripts/standalone-skin-applier.ts apply \
  --game "C:/Riot Games/League of Legends/Game" \
  --fantomes "./generated_skins/Ahri_Skin0.fantome,./generated_skins/Ahri_Skin1.fantome"
```

**参数说明：**
- `--game, -g`：游戏目录路径（必需）
- `--fantomes, -f`：皮肤文件路径列表，用逗号分隔（必需）

**执行流程：**
1. 验证所有输入文件
2. 创建临时目录结构
3. 运行 `mkoverlay` 构建 mod 覆盖层
4. 运行 `patcher` 将皮肤注入到游戏进程

**输出示例：**
```
[12:35:10] [INFO] 开始应用皮肤...
[12:35:10] [INFO] 游戏路径: C:/Riot Games/League of Legends/Game
[12:35:10] [INFO] 皮肤文件: ./generated_skins/Ahri_Skin0.fantome,...
[12:35:10] [INFO] 步骤 1/2: 构建 Mod Overlay...
[12:35:15] [INFO] ✓ Overlay 构建成功
[12:35:15] [INFO] 步骤 2/2: 运行 Patcher 并应用皮肤...
[12:35:20] [INFO] [Patcher] Waiting for game process...
[12:35:45] [INFO] [Patcher] Injected into lol.exe (PID 12345)
[12:35:50] [INFO] Patcher 正常退出
✓ 皮肤应用完成
```

### 命令 3: 完整流程（推荐）

一键生成皮肤并应用到游戏：

```bash
npx ts-node scripts/standalone-skin-applier.ts full \
  --wad "C:/Riot Games/League of Legends/Game/DATA/FINAL/Champions/Ahri.wad.client" \
  --champion Ahri \
  --skins 0,1,2 \
  --game "C:/Riot Games/League of Legends/Game"
```

**参数说明：**
- `--wad, -w`：WAD 文件路径（必需）
- `--champion, -c`：英雄名称（必需）
- `--skins, -s`：皮肤 ID 列表（默认: 0）
- `--game, -g`：游戏目录路径（必需）
- `--output, -o`：输出目录（默认: 临时目录）
- `--author, -a`：作者名称（默认: Bocchi）

**完整输出示例：**
```
========== 皮肤生成和应用完整流程 ==========

[12:36:00] [INFO] 阶段 1: 生成皮肤文件
[12:36:00] [INFO] 开始生成皮肤文件...
✓ 皮肤 #0 生成成功: C:\Users\...\Ahri_Skin0.fantome (25.3MB)
✓ 皮肤 #1 生成成功: C:\Users\...\Ahri_Skin1.fantome (24.8MB)
✓ 皮肤 #2 生成成功: C:\Users\...\Ahri_Skin2.fantome (26.1MB)
✓ 成功生成 3 个皮肤文件

[12:36:15] [INFO] 阶段 2: 应用皮肤到游戏
[12:36:15] [INFO] 开始应用皮肤...
[12:36:20] [INFO] ✓ Overlay 构建成功
[12:36:25] [INFO] [Patcher] 皮肤已应用

========== 完成 ==========
✓ 皮肤已成功应用到游戏
```

## 核心 API

如果想在其他项目中使用此脚本的功能，可以导入对应的函数：

```typescript
import { generateSkin, applySkin } from './scripts/standalone-skin-applier'

// 生成皮肤
const fantomeFiles = await generateSkin({
  wadPath: 'C:/path/to/champion.wad.client',
  champion: 'Ahri',
  skinIds: [0, 1, 2],
  outputDir: './output',
  author: 'MyApp'
})

// 应用皮肤
await applySkin({
  gamePath: 'C:/League of Legends/Game',
  fantomePaths: fantomeFiles,
  timeout: 300000
})
```

## 文件结构

### 生成的文件位置

**生成皮肤时：**
```
<outputDir>/
├── Ahri_Skin0.fantome    (← 皮肤文件)
├── Ahri_Skin1.fantome
└── Ahri_Skin2.fantome
```

**应用皮肤时（临时）：**
```
%TEMP%/bocchi-skin-applier/
└── profile_<timestamp>/
    ├── <mod overlay 数据>   (← mkoverlay 生成)
    └── .state/              (← ltk-manager 缓存)
```

## 配置修改

如果需要修改工具路径、超时时间等，编辑脚本顶部的 `CONFIG` 对象：

```typescript
const CONFIG = {
  LTK_MANAGER_PATH: 'd:/ltk-manager.exe',      // ltk-manager 可执行文件
  CSLOL_DLL_PATH: 'd:/cslol-dll.dll',          // cslol-dll 可执行文件
  TEMP_BASE: path.join(os.tmpdir(), 'bocchi-skin-applier')  // 临时目录
}
```

或者在 `applySkin` 时传递 timeout：

```typescript
await applySkin({
  gamePath: 'C:/League of Legends/Game',
  fantomePaths: fantomeFiles,
  timeout: 600000  // 10 分钟
})
```

## 错误处理

脚本提供详细的错误信息：

| 错误信息 | 解决方案 |
|---------|--------|
| `WAD 文件不存在` | 检查 WAD 文件路径是否正确 |
| `ltk-manager.exe 不存在` | 确保 D:/ltk-manager.exe 存在 |
| `cslol-dll.dll 不存在` | 确保 D:/cslol-dll.dll 存在 |
| `游戏目录不存在` | 检查 League of Legends 安装路径 |
| `Process timed out` | 增加 timeout 参数值 |
| `Patcher 进程异常退出` | 检查 DLL 是否被操作系统拦截或游戏是否在运行 |

## 日志输出

脚本使用统一的日志格式：

```
[时间] [级别] 消息
[12:34:56] [INFO]  正常信息
[12:34:56] [WARN]  警告信息
[12:34:56] [ERROR] 错误信息
```

级别说明：
- **INFO** - 信息性消息
- **WARN** - 警告消息
- **ERROR** - 错误消息

## 安全性注意

⚠️ **重要提示**：
- 此脚本需要 cslol-dll.dll 来修改游戏进程，可能触发反作弊系统
- 使用此脚本可能违反 League of Legends 的服务条款
- 仅供学习和离线使用
- **不要在联网游戏中使用**

## 许可证

遵循项目主许可证
