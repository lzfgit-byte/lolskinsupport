import path from 'node:path';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { MessageUtil } from '../utils/message';
let htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>确认弹窗</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    .trigger-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }

    .modal-overlay.show {
      opacity: 1;
      visibility: visible;
    }

    .modal {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      width: 320px;
      padding: 24px;
      transform: scale(0.8);
      transition: transform 0.3s ease;
    }

    .modal-overlay.show .modal {
      transform: scale(1);
    }

    .modal-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .modal-icon {
      width: 50px;
      height: 50px;
      background: #e8f5e9;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 12px;
    }

    .modal-icon svg {
      width: 24px;
      height: 24px;
      fill: #4CAF50;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .modal-body {
      text-align: center;
      margin-bottom: 20px;
    }

    .modal-text {
      color: #666;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .progress-container {
      width: 100%;
      height: 6px;
      background: #f0f0f0;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
      border-radius: 3px;
      width: 100%;
      transition: width 1s linear;
    }

    .countdown {
      font-size: 13px;
      font-weight: 500;
      color: #666;
    }

    .modal-footer {
      display: flex;
      gap: 10px;
    }

    .btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .confirm-btn {
      background: #4CAF50;
      color: white;
    }

    .confirm-btn:hover {
      background: #45a049;
    }

    .cancel-btn {
      background: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
    }

    .cancel-btn:hover {
      background: #e0e0e0;
    }
  </style>
</head>
<body>
<div class="modal-overlay" id="confirmModal">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-icon">
        <svg viewBox="0 0 24 24">
          <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"></path>
        </svg>
      </div>
      <h3 class="modal-title">确认操作</h3>
    </div>

    <div class="modal-body">
      <p class="modal-text">您确定要执行此操作吗？此操作不可撤销。</p>

      <div class="progress-container">
        <div class="progress-bar" id="progressBar"></div>
      </div>

      <div class="countdown" id="countdown">5 秒后自动确认</div>
    </div>

    <div class="modal-footer">
      <button class="btn cancel-btn" onclick="closeModal()">取消</button>
      <button class="btn confirm-btn" onclick="confirmAction()">确认</button>
    </div>
  </div>
</div>

<script>
const { ipcRenderer } = require('electron');
let countdownInterval;
  let countdownTime = 5;

  function showModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.add('show');

    countdownTime = 5;
    updateCountdown();
    document.getElementById('progressBar').style.width = '100%';

    countdownInterval = setInterval(updateProgress, 1000);
  }

  function closeModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    clearInterval(countdownInterval);
  }

  function updateCountdown() {
    document.getElementById('countdown').textContent =
      countdownTime + ' 秒后自动确认';
  }

  function updateProgress() {
    countdownTime--;
    updateCountdown();

    const progress = (countdownTime / 5) * 100;
    document.getElementById('progressBar').style.width = progress + '%';

    if (countdownTime <= 0) {
      confirmAction();
    }
  }

  function confirmAction() {
    // clearInterval(countdownInterval);
    // closeModal();
    // alert('操作已确认！');
    ipcRenderer.send('show-confirm');
  }

  document.getElementById('confirmModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeModal();
    }
  });
  showModal()
</script>
</body>
</html>
`;
export const showConfirmWindow = () => {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  let targetWidth = 800;
  let targetHeight = 600;
  let targetX = screenWidth - targetWidth; // 右上角
  let targetY = 0;

  // 初始宽度设为 0，实现动画效果
  let win: BrowserWindow = new BrowserWindow({
    width: 0,
    height: targetHeight,
    x: screenWidth, // 从屏幕最右边开始
    y: targetY,
    show: true,
    frame: true,
    title: '确认弹窗',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const base64Html = Buffer.from(htmlContent).toString('base64');
  win.loadURL(`data:text/html;base64,${base64Html}`);

  // 动画：逐步展开窗口
  let currentWidth = 0;
  let animation = setInterval(() => {
    currentWidth += 40; // 每次增加的宽度
    if (currentWidth >= targetWidth) {
      currentWidth = targetWidth;
      clearInterval(animation);
    }
    win.setBounds({
      x: screenWidth - currentWidth,
      y: targetY,
      width: currentWidth,
      height: targetHeight,
    });
  }, 10);

  ipcMain.on('show-confirm', () => {
    win.close();
  });
};
