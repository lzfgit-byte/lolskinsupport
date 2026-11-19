/**
 * 构建进度通知的 HTML。
 *
 * 位置和滑入动画沿用侧边通知（`use-confirm-window.ts`），但卡片本身按现代通知重做：
 * 左边一个状态图标（转圈 / ✓ / ✕），右边标题、当前阶段、进度条、最近一条日志，
 * 卡片用透明窗口 + CSS 阴影，圆角是真的圆角。
 */

export const progressHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>构建进度</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent;
    }
    body {
      padding: 10px;
    }
    .card {
      width: $widthpx;
      height: 100%;
      background: #ffffff;
      border-radius: 14px;
      border: 1px solid rgba(15, 23, 42, 0.06);
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06);
      padding: 13px 14px 11px;
      display: flex;
      gap: 11px;
      position: relative;
    }
    .icon {
      flex: 0 0 34px;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eef4ff;
      color: #1677ff;
      font-size: 16px;
      font-weight: 700;
      position: relative;
    }
    .icon .ring {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid rgba(22, 119, 255, 0.25);
      border-top-color: #1677ff;
      animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .icon.success { background: #e8f8ee; color: #00b42a; }
    .icon.error { background: #fdecec; color: #f53f3f; }

    .body { flex: 1; min-width: 0; }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .title {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .close {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: #9ca3af;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      display: none;
    }
    .close:hover { background: #f3f4f6; color: #374151; }
    .card.show-close .close { display: block; }

    .message {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.4;
      color: #4b5563;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bar {
      margin-top: 8px;
      height: 6px;
      border-radius: 999px;
      background: #eef1f5;
      overflow: hidden;
    }
    .bar > i {
      display: block;
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, #1677ff, #22c3ee);
      transition: width 0.25s ease, background 0.25s ease;
    }
    .card.success .bar > i { background: linear-gradient(90deg, #00b42a, #52c41a); }
    .card.error .bar > i { background: linear-gradient(90deg, #f53f3f, #ff7d7d); }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
      min-height: 14px;
    }
    .detail {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      color: #9aa3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .percent {
      flex: 0 0 auto;
      font-size: 11px;
      color: #6b7280;
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="icon" id="icon"><span class="ring"></span></div>
    <div class="body">
      <div class="head">
        <div class="title" id="title">$title</div>
        <button class="close" id="closeBtn" onclick="dismiss()">×</button>
      </div>
      <div class="message" id="message">准备中…</div>
      <div class="bar"><i id="fill"></i></div>
      <div class="foot">
        <div class="detail" id="detail"></div>
        <div class="percent" id="percent">0%</div>
      </div>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    const card = document.getElementById('card');
    const icon = document.getElementById('icon');
    const titleEl = document.getElementById('title');
    const messageEl = document.getElementById('message');
    const detailEl = document.getElementById('detail');
    const percentEl = document.getElementById('percent');
    const fill = document.getElementById('fill');

    const setState = (state) => {
      card.classList.remove('success', 'error', 'show-close');
      icon.classList.remove('success', 'error');
      if (state === 'success') {
        card.classList.add('success');
        icon.classList.add('success');
        icon.textContent = '✓';
      } else if (state === 'error') {
        card.classList.add('error', 'show-close');
        icon.classList.add('error');
        icon.textContent = '✕';
      } else {
        icon.innerHTML = '<span class="ring"></span>';
      }
    };

    ipcRenderer.on('$hashId-update', (_event, payload) => {
      if (!payload) return;
      if (payload.title) titleEl.textContent = payload.title;
      if (typeof payload.percent === 'number') {
        const percent = Math.max(0, Math.min(100, Math.round(payload.percent)));
        fill.style.width = percent + '%';
        percentEl.textContent = percent + '%';
      }
      if (payload.message) messageEl.textContent = payload.message;
      if (typeof payload.detail === 'string') detailEl.textContent = payload.detail;
      if (payload.state) setState(payload.state);
    });

    function dismiss() {
      ipcRenderer.send('$hashId-dismiss');
    }
  </script>
</body>
</html>
`;
