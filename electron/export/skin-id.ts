/**
 * 皮肤 id 的两种写法：
 *
 *   - 皮肤列表/文件夹里的 id：`<英雄 id><序号>`，例如 JarvanIV 的 `59005`（59 + 005）；
 *   - 生成皮肤要的序号：游戏里就是 `data/characters/jarvaniv/skins/skin5.bin`，即 `5`。
 *
 * 以前「没皮肤直接构建」直接把 59005 当序号传下去，于是去找 `skin59005.bin`，
 * 扫了 50 个 id 都没找到，最后什么也没生成（手动「当前皮肤文件」走的是正确换算，
 * 所以能成功）。这里把换算抽出来，两处共用。
 */

export const toSkinIndex = (heroId: string, skinId: string): number => {
  const raw = `${skinId}`.trim();
  const hero = `${heroId}`.trim();
  // 只去掉开头的英雄 id（`59` + `59005` -> `005`），不能简单 replace 中间出现的数字
  const stripped = hero && raw.startsWith(hero) ? raw.slice(hero.length) : raw;
  const index = Number(stripped);
  if (Number.isFinite(index)) {
    return index;
  }
  const fallback = Number(raw);
  return Number.isFinite(fallback) ? fallback : NaN;
};
