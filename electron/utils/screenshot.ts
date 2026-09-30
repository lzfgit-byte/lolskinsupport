import { promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { desktopCapturer, screen } from 'electron';
import type { NativeImage } from 'electron';
import { SCREENSHOT_PATH } from '@ghs/constant';
import { configPath, defaultScreenshotPath } from '../const';

/**
 * 获取当前本地时间的 YYYY-MM-DD 格式字符串
 */
function getFormattedDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取当前本地时间的 xx时xx分xx秒 格式字符串（用于文件名后缀）
 */
function getFormattedTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}时${minutes}分${seconds}秒`;
}

/**
 * 读取配置中设置的截图保存根目录，未设置时回退到默认目录
 */
function getScreenshotBaseDir(): string {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const configured = config[SCREENSHOT_PATH];
    return configured || defaultScreenshotPath;
  } catch {
    return defaultScreenshotPath;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 采集主显示器当前画面（只采集，不落盘）。
 *
 * 注意：游戏处于独占全屏时，系统可能返回未刷新的旧帧（拿到的画面比实际时间早），
 * 调用方可用 getImageSignature 判断相邻两次采集是否拿到同一帧。
 */
async function grabPrimaryScreenImage(): Promise<NativeImage | null> {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();

    // Electron 的 display.size 通常是 DIP 尺寸，
    // scaleFactor 用来转换成实际物理像素。
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    const targetWidth = Math.max(1, Math.round(primaryDisplay.size.width * scaleFactor));
    const targetHeight = Math.max(1, Math.round(primaryDisplay.size.height * scaleFactor));

    console.log(`[Screenshot] Display: ${targetWidth}x${targetHeight} @ ${scaleFactor}x`);

    // 直接要求 desktopCapturer 获取目标分辨率的 thumbnail，
    // 不要先拿低分辨率图片再 resize。
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: targetWidth,
        height: targetHeight,
      },
      fetchWindowIcons: false,
    });

    if (!sources.length) {
      console.error('[Screenshot] No screen source found');
      return null;
    }

    // 优先寻找主显示器
    const targetSource =
      sources.find((source) => {
        const displayId = Number((source as any).display_id ?? (source as any).displayId ?? -1);
        return displayId === primaryDisplay.id;
      }) ?? sources[0];

    if (!targetSource) {
      console.error('[Screenshot] Target screen source not found');
      return null;
    }

    const image = targetSource.thumbnail;

    if (image.isEmpty()) {
      console.error('[Screenshot] Captured image is empty');
      return null;
    }

    const actualSize = image.getSize();

    console.log(`[Screenshot] Captured: ${actualSize.width}x${actualSize.height}`);

    // 正常情况下 thumbnail 已经是目标分辨率。
    // 只有 Electron / 系统返回的尺寸确实不足时才进行放大。
    let finalImage = image;

    if (actualSize.width < targetWidth || actualSize.height < targetHeight) {
      console.warn(
        `[Screenshot] Source resolution is lower than target: ` +
          `${actualSize.width}x${actualSize.height} -> ` +
          `${targetWidth}x${targetHeight}`
      );

      finalImage = image.resize({
        width: targetWidth,
        height: targetHeight,
        quality: 'best',
      });
    }

    const finalSize = finalImage.getSize();

    console.log(`[Screenshot] Final image: ${finalSize.width}x${finalSize.height}`);

    return finalImage;
  } catch (error) {
    console.error('[Screenshot] Failed to capture current screen:', error);
    return null;
  }
}

/**
 * 计算画面指纹（抽样哈希，避免整帧哈希带来的额外开销）。
 * 相邻两次采集指纹相同 => 拿到的是同一帧（画面本身静止，或独占全屏下采集到了旧帧）。
 */
export function getImageSignature(image: NativeImage): string {
  try {
    const bitmap = image.toBitmap(); // BGRA
    const stride = 97; // 质数步长，避免与行宽对齐导致漏采样
    const sample = Buffer.allocUnsafe(Math.ceil(bitmap.length / stride) + 1);
    let size = 0;

    for (let i = 0; i < bitmap.length; i += stride) {
      sample[size++] = bitmap[i];
    }

    return createHash('md5').update(sample.subarray(0, size)).digest('hex');
  } catch (error) {
    console.error('[Screenshot] Failed to compute image signature:', error);
    return '';
  }
}

/**
 * 把采集到的画面保存为 PNG
 * @param image 采集到的画面
 * @param prefix 文件名前缀，默认 'screenshot'
 * @param subDir 可选的子目录名称（例如 'quadrakill', 'pentakill'），
 *               会将截图放置在 <截图根目录>/<subDir>/<YYYY-MM-DD> 中
 * @param extraName 追加在前缀之后、时间戳之前的名称（调试用，例如 '-t820ms'）
 */
export async function saveScreenImage(
  image: NativeImage,
  prefix = 'screenshot',
  subDir = '',
  extraName = ''
): Promise<string | null> {
  try {
    const finalSize = image.getSize();

    // 获取当前年月日字符串 (例如 "2026-08-16")
    const dateStr = getFormattedDate();

    // 保存路径结构（根目录为配置的截图保存路径，默认 Pictures/lolskinsupport）：
    // 如果有 subDir： <baseDir> / <subDir> / <YYYY-MM-DD>
    // 如果无 subDir： <baseDir> / <YYYY-MM-DD>
    const baseDir = getScreenshotBaseDir();
    const dir = subDir ? join(baseDir, subDir, dateStr) : join(baseDir, dateStr);

    await fs.mkdir(dir, {
      recursive: true,
    });

    const filePath = join(dir, `${prefix}${extraName}-${getFormattedTime()}.png`);

    // PNG 无损，不会因为 JPEG 压缩导致文字、血条等变糊
    const pngBuffer = image.toPNG();

    await fs.writeFile(filePath, pngBuffer);

    console.log(
      `[Screenshot] Saved: ${filePath} ` +
        `(${finalSize.width}x${finalSize.height}, ${pngBuffer.length} bytes)`
    );

    return filePath;
  } catch (error) {
    console.error('[Screenshot] Failed to save screenshot:', error);
    return null;
  }
}

/**
 * 截取当前屏幕并保存（单帧，立即采集）
 * @param prefix 文件名前缀，默认 'screenshot'
 * @param subDir 可选的子目录名称（例如 'quadrakill', 'pentakill'）
 */
export async function captureAppScreenshot(
  prefix = 'screenshot',
  subDir = ''
): Promise<string | null> {
  const image = await grabPrimaryScreenImage();

  if (!image) {
    return null;
  }

  return saveScreenImage(image, prefix, subDir);
}

export interface BurstCaptureOptions {
  /** 文件名前缀 */
  prefix?: string;
  /** 一级子目录名 */
  subDir?: string;
  /** 触发后、开始连拍前的等待时间（毫秒），用于等游戏内横幅渲染完成 */
  initialDelayMs?: number;
  /** 连拍总时长（毫秒），期间每隔 intervalMs 采集一次，最终保存最后一帧 */
  windowMs?: number;
  /** 连拍间隔（毫秒） */
  intervalMs?: number;
  /** 调试模式：把每一张内容不同的帧都保存下来，便于校准延迟 */
  saveAllFrames?: boolean;
}

/**
 * 连拍若干帧，并保存最后（最新）的一帧。
 *
 * 为什么不沿用"等固定时间只截一张"：
 * 1. 多杀事件（EventData）到达时，游戏内横幅（双杀/三杀/四杀/五杀）往往还没渲染完，
 *    固定的小延迟很容易截到横幅出现之前的画面（即"提前截取"）；
 * 2. 独占全屏下 desktopCapturer 可能返回尚未刷新的旧帧，只截一张没有任何补救机会；
 * 3. 横幅在屏幕上会停留数秒，所以"晚一点截"远比"早一点截"安全。
 */
export async function captureScreenBurst(
  options: BurstCaptureOptions = {}
): Promise<string | null> {
  const {
    prefix = 'screenshot',
    subDir = '',
    initialDelayMs = 1200,
    windowMs = 800,
    intervalMs = 250,
    saveAllFrames = false,
  } = options;

  if (initialDelayMs > 0) {
    await delay(initialDelayMs);
  }

  const startedAt = Date.now();
  const totalWindow = Math.max(0, Math.min(windowMs, 5000));
  // 记录"内容不重复"的帧序列，最后一项始终是最新采集到的画面
  const frames: { image: NativeImage; signature: string; offsetMs: number }[] = [];

  let finished = false;

  while (!finished) {
    const image = await grabPrimaryScreenImage();

    if (image) {
      const signature = getImageSignature(image);
      const offsetMs = Date.now() - startedAt;
      const last = frames[frames.length - 1];

      if (last && signature && last.signature === signature) {
        // 与上一帧完全一致：沿用同一个内容，只更新时间（说明这段时间画面没有变化）
        frames[frames.length - 1] = { image, signature, offsetMs };
      } else {
        frames.push({ image, signature, offsetMs });
      }
    }

    finished = Date.now() - startedAt >= totalWindow;

    if (!finished) {
      await delay(intervalMs);
    }
  }

  if (!frames.length) {
    console.error('[Screenshot] Burst capture got no frame');
    return null;
  }

  console.log(
    `[Screenshot] Burst done: ${frames.length} distinct frame(s) in ${Date.now() - startedAt}ms ` +
      `(offsets: ${frames.map((item) => `${item.offsetMs}ms`).join(', ')})`
  );

  if (saveAllFrames) {
    let lastSaved: string | null = null;

    for (const frame of frames) {
      const saved = await saveScreenImage(frame.image, prefix, subDir, `-t${frame.offsetMs}ms`);
      if (saved) {
        lastSaved = saved;
      }
    }

    return lastSaved;
  }

  // 取最后一帧：即使系统返回的帧有延迟，也能保证拿到的是"横幅已经出现"的画面
  return saveScreenImage(frames[frames.length - 1].image, prefix, subDir);
}
