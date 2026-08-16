import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, desktopCapturer, screen } from 'electron';

/**
 * 截取当前屏幕并保存
 * @param prefix 文件名前缀，默认 'screenshot'
 * @param subDir 可选的子目录名称（例如 'quadrakill', 'pentakill'），会将截图放置在 Pictures/lolskinsupport/<subDir> 中
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

    // 保存到 Pictures/lolskinsupport / [subDir]
    const baseDir = join(app.getPath('pictures'), 'lolskinsupport');
    const dir = subDir ? join(baseDir, subDir) : baseDir;

    await fs.mkdir(dir, {
      recursive: true,
    });

    const filePath = join(dir, `${prefix}-${Date.now()}.png`);

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
