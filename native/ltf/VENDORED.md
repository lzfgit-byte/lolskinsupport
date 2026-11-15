# Vendored LeagueToolFlop (LTF) sources

本项目的注入方式与 Rose 1.5 一致：不打包 LTK Manager 的 patcher 二进制，而是从
这些源码构建 LTF 桥。

`ltk_launcher.exe` 以隐藏方式启动 LTK Manager，并把 `LeagueToolFlop.dll` 注入进去；
DLL 在 LTK Manager 进程里提供 TCP 桥（`electron/export/ltfBridge.ts` 与它通信）：
导入/开关/卸载模组、启停 LTK Manager 自己的 patcher。皮肤不再经过
`mod-tools.exe import` / `mkoverlay`，也不需要用户自备 `ltk_patcher_host.exe`。

由 `script/build-ltf.mjs` 构建到 `native/ltf/build/`（`npm run ltf:build`），打包时
由 electron-builder 作为 `extraResources` 放到 `resources/ltf/`。

没有 MSVC 时，也可以直接取 Rose 安装目录里的现成文件：

```
D:\Program Files\Rose\_internal\injection\tools\ltk_launcher.exe
D:\Program Files\Rose\_internal\injection\tools\LeagueToolFlop.dll
```

拷到 `native/ltf/build/` 即可（当前工作区就是这么来的，版本来自 Rose 1.5.6）。

## Files

| File | Origin |
| --- | --- |
| `LeagueToolFlop-inj.cpp` | LTF launcher（构建成 `ltk_launcher.exe`） |
| `LeagueToolFlop_dll.cpp` | LTF bridge DLL（构建成 `LeagueToolFlop.dll`） |

launcher 写死了桥 DLL 的文件名：它必须在 `ltk_launcher.exe` 旁边找到
`LeagueToolFlop.dll`。

来源：Rose 仓库 `native/ltf/`（同样来自 LTF 上游；该项目还带
`fantome_processor.hpp`，导入时会重写皮肤，本项目不用，因此没有引入，
`CmdImport` 原样安装收到的压缩包）。

## Rose's changes to the LTF sources

更新这两个文件时必须一并带上这些改动（TS 侧依赖它们）：

- **Launcher**：`wmain`（UTF-16 路径）、`--quiet`（不弹框）、每次启动用一个新的
  CDP 端口而不是 9222、`--remote-allow-origins` 只放行该端点自己的来源。它不会
  杀掉已经开着的 LTK Manager，而是以退出码 5 返回。它只注入自己启动的那个进程，
  或该进程重新拉起的那个（LTK Manager 会以非提权方式重启自己），两个都不在时以
  退出码 6 返回，并打印 `LTK_MANAGER_PID=<pid>`。它以 `explorer.exe` 作为记录的
  父进程（`PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`）：patcher DLL 会校验启动它的
  进程链，否则拒绝 overlay。`CreateProcessWithTokenW` 不接受该属性，所以提权运行
  时 launcher 会以 `--as-user-child` 启动一个非提权的自己，由它去创建、注入并
  恢复管理器，再通过 `--pid-file` 回传 pid。
- **DLL**：UTF-8 路径走宽字符文件 API。只使用 LTK Manager 自己的 CDP 页面（不回退
  到其它程序的页面）。除 `hello`/`ping` 外，每条命令都要带令牌，DLL 把它发布在
  `HKCU\Software\LTKBridge\ApiToken` 和 `%LOCALAPPDATA%\LTKBridge\token.txt`。
  `raw_invoke` 已移除。安装有 3 分钟 CDP 预算，暂存文件名会做安全处理并总是带压缩
  包扩展名。`import` 把压缩包原样交给 LTK Manager：处理器被移除，以字节形式发来的
  压缩包只写到暂存文件再交给它。它还重定向宿主的窗口显示调用：LTK Manager 前端在
  页面挂载后会 `show_main_window`，只在 100ms 的 `HideThread` 轮询里隐藏会让窗口
  在屏幕上停留 60-80ms（启动时闪一下）。只接管 `ShowWindow` 还不够：tao 把 VISIBLE
  窗口标志当作样式修改（`SetWindowLongW`）并用 `SetWindowPos(SWP_FRAMECHANGED)` 呈现，
  并不通过 `SetWindowPos` 显示窗口。所以 `ShowWindow`/`ShowWindowAsync`、
  `SetWindowPos`（丢掉 `SWP_SHOWWINDOW`）、`SetWindowPlacement`（`showCmd` 强制
  `SW_HIDE`）以及样式设置函数（`SetWindowLongPtrW/A`、`SetWindowLongW/A`：丢掉
  `WS_VISIBLE`）都被重定向。有主窗口的弹窗/菜单保留显示；轮询作为兜底。
