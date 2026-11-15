#!/usr/bin/env node
/**
 * 构建 LTF 桥：native/ltf/*.cpp -> native/ltf/build/{ltk_launcher.exe, LeagueToolFlop.dll}
 *
 * 这两个文件由 ltk_launcher.exe 注入到 LTK Manager 里，是注入方式的运行时
 * （与 Rose 1.5 一致）。它们不随仓库提交，打包时由 electron-builder 作为
 * extraResources 带上。
 *
 * 需要 MSVC x64 生成工具（Visual Studio C++ 生成工具）。
 * 已经从 Rose 的安装目录拷到 native/ltf/build/ 的话，可以不重新编译。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'native', 'ltf');
const OUT_DIR = path.join(SOURCE_DIR, 'build');
const LAUNCHER = path.join(OUT_DIR, 'ltk_launcher.exe');
const BRIDGE_DLL = path.join(OUT_DIR, 'LeagueToolFlop.dll');

// /utf-8 保住源码里的破折号；/MT 让注入的 DLL 不依赖 CRT
const COMMON_FLAGS = ['/nologo', '/std:c++20', '/O2', '/EHsc', '/MT', '/utf-8'];
const LAUNCHER_SOURCES = ['LeagueToolFlop-inj.cpp'];
const DLL_SOURCES = ['LeagueToolFlop_dll.cpp'];
const DLL_LIBS = [
  'ws2_32.lib',
  'psapi.lib',
  'user32.lib',
  'advapi32.lib',
  'shell32.lib',
  'bcrypt.lib',
];

const findVcvars = () => {
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );
  if (!fs.existsSync(vswhere)) {
    return null;
  }
  let stdout = '';
  try {
    stdout = execFileSync(
      vswhere,
      [
        '-latest',
        '-products',
        '*',
        '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        '-property',
        'installationPath',
      ],
      { encoding: 'utf-8' }
    );
  } catch {
    return null;
  }
  for (const line of stdout.split(/\r?\n/)) {
    const candidate = path.join(line.trim(), 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    if (line.trim() && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const build = () => {
  const vcvars = findVcvars();
  if (!vcvars) {
    console.error('[ERROR] 没有找到 MSVC x64 生成工具。');
    console.error('        请安装 Visual Studio 的「使用 C++ 的桌面开发」工作负载，');
    console.error('        或者把 Rose 安装目录 _internal/injection/tools 里的');
    console.error('        ltk_launcher.exe、LeagueToolFlop.dll 拷到 native/ltf/build/。');
    return 1;
  }

  const missing = [...LAUNCHER_SOURCES, ...DLL_SOURCES].filter(
    (name) => !fs.existsSync(path.join(SOURCE_DIR, name))
  );
  if (missing.length > 0) {
    console.error(`[ERROR] native/ltf 里缺少源码: ${missing.join(', ')}`);
    return 1;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltf-build-'));
  const script = path.join(workDir, 'build.bat');
  // 目标文件放临时目录，不要落在 vendored 源码旁边
  const objects = `/Fo"${workDir}\\\\"`;
  const lines = [
    '@echo off',
    `call "${vcvars}" >nul || exit /b 1`,
    `cd /d "${SOURCE_DIR}"`,
    `cl ${COMMON_FLAGS.join(' ')} ${objects} ${LAUNCHER_SOURCES.join(
      ' '
    )} /link /OUT:"${LAUNCHER}" || exit /b 1`,
    `cl ${COMMON_FLAGS.join(' ')} /LD ${objects} ${DLL_SOURCES.join(
      ' '
    )} /link /OUT:"${BRIDGE_DLL}" ${DLL_LIBS.join(' ')} || exit /b 1`,
  ];
  fs.writeFileSync(script, `${lines.join('\r\n')}\r\n`, 'utf-8');

  const result = spawnSync('cmd', ['/d', '/c', script], { stdio: 'inherit' });
  fs.rmSync(workDir, { recursive: true, force: true });

  if (result.status !== 0) {
    console.error(`[ERROR] LTF 桥构建失败（退出码 ${result.status}）。`);
    return result.status || 1;
  }
  console.log(`[OK] 已生成 ${LAUNCHER}`);
  console.log(`[OK] 已生成 ${BRIDGE_DLL}`);
  return 0;
};

process.exit(build());
