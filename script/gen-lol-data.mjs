/**
 * 预生成英雄/皮肤数据 JSON
 *
 * 从 game.gtimg.cn 拉取英雄列表与每个英雄的皮肤数据，写入 public/lol-data/，
 * 打包时随 dist 一起发布，运行时直接读本地文件，不再依赖网络请求。
 *
 * 用法：
 *   node script/gen-lol-data.mjs            # 只补齐缺失的英雄（增量）
 *   node script/gen-lol-data.mjs --force    # 全量重新生成
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://game.gtimg.cn/images/lol/act/img/js';
const OUT_DIR = join(__dirname, '../public/lol-data');
const HERO_DIR = join(OUT_DIR, 'heroes');
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 8;
const MAX_RETRY = 3;
const TIMEOUT = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 带重试与超时的 GET，返回解析后的 JSON；失败返回 null */
const fetchJson = async (url, retry = MAX_RETRY) => {
  for (let i = 0; i < retry; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { 'user-agent': 'Mozilla/5.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text) {
        throw new Error('empty response');
      }
      return JSON.parse(text);
    } catch (e) {
      if (i === retry - 1) {
        console.warn(`  ✗ ${url} -> ${e?.message || e}`);
        return null;
      }
      await sleep(500 * (i + 1));
    }
  }
  return null;
};

/** 并发执行任务，限制并发数 */
const runPool = async (items, worker, concurrency = CONCURRENCY) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const writeJson = (filePath, data) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data), { encoding: 'utf-8' });
};

const main = async () => {
  mkdirSync(HERO_DIR, { recursive: true });

  console.log('==> 拉取英雄列表 hero_list');
  const heroListPath = join(OUT_DIR, 'hero_list.json');
  let heroList = FORCE ? null : readLocal(heroListPath);
  if (!heroList) {
    heroList = await fetchJson(`${BASE_URL}/heroList/hero_list.js`);
    if (!heroList?.hero?.length) {
      if (existsSync(heroListPath)) {
        console.warn('!! 英雄列表拉取失败，保留已有本地文件');
        heroList = readLocal(heroListPath);
      } else {
        console.error('!! 英雄列表拉取失败且本地无缓存，终止');
        process.exitCode = 1;
        return;
      }
    } else {
      writeJson(heroListPath, heroList);
      console.log(`    写入 hero_list.json（${heroList.hero.length} 个英雄）`);
    }
  } else {
    console.log('    已存在，跳过（--force 可强制重新生成）');
  }

  const heroes = heroList?.hero || [];
  const pending = heroes.filter((item) => {
    const file = join(HERO_DIR, `${item.heroId}.json`);
    return FORCE || !existsSync(file);
  });
  console.log(`==> 皮肤数据：共 ${heroes.length} 个英雄，待生成 ${pending.length} 个`);

  let done = 0;
  let failed = 0;
  await runPool(pending, async (item) => {
    const data = await fetchJson(`${BASE_URL}/hero/${item.heroId}.js`);
    if (!data?.skins?.length) {
      failed++;
      return;
    }
    writeJson(join(HERO_DIR, `${item.heroId}.json`), data);
    done++;
    if ((done + failed) % 20 === 0) {
      console.log(`    进度 ${done + failed}/${pending.length}`);
    }
  });

  const meta = {
    generatedAt: new Date().toISOString(),
    heroCount: heroes.length,
    version: readVersion(),
  };
  writeJson(join(OUT_DIR, 'meta.json'), meta);

  console.log(`==> 完成：新增 ${done} 个，失败 ${failed} 个，输出目录 public/lol-data`);
  if (failed > 0) {
    console.warn('    失败项可再次执行本脚本补齐（已存在的文件会跳过）');
  }
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

function readLocal(filePath) {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return JSON.parse(readFileSync(filePath, { encoding: 'utf-8' }));
  } catch {
    return null;
  }
}

function readVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), { encoding: 'utf-8' })
    );
    return pkg.version;
  } catch {
    return '';
  }
}
