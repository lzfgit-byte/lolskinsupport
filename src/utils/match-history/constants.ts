/**
 * Akari Score 评分常量与通用数学工具
 *
 * 迁移自 League Akari（src/shared/data-adapter/analysis/player/constants.ts、
 * src/shared/data-adapter/utils.ts），仅保留战绩分析所需部分。
 */

// ---------------- Akari Score 常量 ----------------

/** Akari KDA 起评分 */
export const AKARI_KDA_BASELINE = 2;

/** Akari KDA 分数权重 */
export const AKARI_KDA_WEIGHT = 3 / 7;

/** Akari KDA 分数满分 */
export const AKARI_KDA_MAX_SCORE = 1;

/** Akari 胜率基准线 */
export const AKARI_WIN_RATE_BASELINE = 0.5;

/** Akari 胜率分数权重 */
export const AKARI_WIN_RATE_WEIGHT = 1;

/** Akari 输出分数权重 */
export const AKARI_DAMAGE_WEIGHT = 3;

/** Akari 承伤分数权重 */
export const AKARI_DAMAGE_TAKEN_WEIGHT = 2;

/** Akari 治疗起评分所需的本队平均承伤比例 */
export const AKARI_HEALING_MIN_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO = 0.2;

/** Akari 多人队伍治疗满分所需的本队平均承伤比例 */
export const AKARI_HEALING_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO = 1.4;

/** Akari 单人队伍治疗满分所需的本队平均承伤比例 */
export const AKARI_HEALING_SOLO_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO = 1;

/** Akari 治疗分数满分 */
export const AKARI_HEALING_MAX_SCORE = 2;

/** Akari 补刀满分所需分均补刀 */
export const AKARI_CS_FULL_SCORE_PER_MINUTE = 10;

/** Akari 补刀起评分均补刀 */
export const AKARI_CS_MIN_SCORE_PER_MINUTE = 5;

/** Akari 补刀分数满分 */
export const AKARI_CS_MAX_SCORE = 2;

/** Akari 经济分数权重 */
export const AKARI_GOLD_WEIGHT = 2;

/** Akari 参团率起评分 */
export const AKARI_PARTICIPATION_MIN_SHARE = 0.3;

/** Akari 参团分数满分 */
export const AKARI_PARTICIPATION_WEIGHT = 2;

/** Akari 伤害、承伤、视野满分所需理应贡献比 */
export const AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO = 2.0;

/** Akari 理应贡献起评分比 */
export const AKARI_EXPECTED_CONTRIBUTION_BASELINE_RATIO = 1.0;

/** Akari 经济满分所需理应贡献比 */
export const AKARI_GOLD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO = 1.5;

/** Akari 视野分数满分 */
export const AKARI_VISION_MAX_SCORE = 2;

/** Akari 总分满分 */
export const AKARI_MAX_SCORE =
  AKARI_KDA_MAX_SCORE +
  AKARI_WIN_RATE_WEIGHT +
  AKARI_DAMAGE_WEIGHT +
  AKARI_DAMAGE_TAKEN_WEIGHT +
  AKARI_HEALING_MAX_SCORE +
  AKARI_CS_MAX_SCORE +
  AKARI_GOLD_WEIGHT +
  AKARI_PARTICIPATION_WEIGHT +
  AKARI_VISION_MAX_SCORE;

/** 聚合 Akari outstanding 阈值 */
export const AGGREGATE_AKARI_OUTSTANDING_THRESHOLD = 6.5;

/** 聚合 Akari outstanding 最小样本数 */
export const AGGREGATE_AKARI_OUTSTANDING_MIN_COUNT = 5;

/** 聚合 Akari extraordinary 阈值 */
export const AGGREGATE_AKARI_EXTRAORDINARY_THRESHOLD = 8;

/** 聚合 Akari extraordinary 最小样本数 */
export const AGGREGATE_AKARI_EXTRAORDINARY_MIN_COUNT = 8;

// ---------------- 通用数学工具 ----------------

export function noZero(value: number): number {
  return value || 1;
}

export function avgOrZero(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
}

export function calculateCoefficientOfVariation(numbers: number[]): number {
  if (!numbers || numbers.length === 0) {
    return -1;
  }

  const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  if (mean === 0) {
    return -1;
  }

  const variance =
    numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
  const standardDeviation = Math.sqrt(variance);

  return standardDeviation / mean;
}
