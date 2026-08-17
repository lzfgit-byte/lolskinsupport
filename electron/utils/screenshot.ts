import { promises as fs, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { desktopCapturer, screen } from 'electron';
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

/**
 * 截取当前屏幕并保存
 * @param prefix 文件名前缀，默认 'screenshot'
 * @param subDir 可选的子目录名称（例如 'quadrakill', 'pentakill'），会将截图放置在 Pictures/lolskinsupport/<subDir>/<YYYY-MM-DD> 中
 */
export async function captureAppScreenshot(
  prefix = 'screenshot',
  subDir = ''
): Promise<string | null> {
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

    const filePath = join(dir, `${prefix}-${getFormattedTime()}.png`);

    // PNG 无损，不会因为 JPEG 压缩导致文字、血条等变糊
    const pngBuffer = finalImage.toPNG();

    await fs.writeFile(filePath, pngBuffer);

    console.log(`[Screenshot] Saved: ${filePath} (${pngBuffer.length} bytes)`);

    return filePath;
  } catch (error) {
    console.error('[Screenshot] Failed to capture current screen:', error);
    return null;
  }
}
