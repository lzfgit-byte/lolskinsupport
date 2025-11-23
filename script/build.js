console.log(1);
/**
 * 将dist文件夹的内容复制到dist/h5文件夹里
 */
const fs = require('node:fs');
const path = require('node:path');

// 定义源目录和目标目录
const sourceDir = path.join(__dirname, '..', 'packages', 'h5', 'dist');
const targetDir = path.join(__dirname, '..', 'dist', 'h5');

// 确保目录存在
function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 复制单个文件
function copyFileSync(source, target) {
  ensureDirExists(path.dirname(target));

  // 如果目标文件已存在，则删除它
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }

  fs.copyFileSync(source, target);
}

// 复制目录内容
function copyDirectoryContent(source, target) {
  // 确保目标目录存在
  ensureDirExists(target);

  // 读取源目录的内容
  const files = fs.readdirSync(source);

  for (const file of files) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);

    if (fs.statSync(sourcePath).isDirectory()) {
      // 如果是目录，则递归调用复制函数
      copyDirectoryContent(sourcePath, targetPath);
    } else {
      // 如果是文件，则复制文件
      copyFileSync(sourcePath, targetPath);
    }
  }
}

// 调用复制函数
copyDirectoryContent(sourceDir, targetDir);

console.log('目录内容复制完成');
