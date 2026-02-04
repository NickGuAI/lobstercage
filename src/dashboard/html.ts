// Embedded HTML/CSS/JS for the dashboard

import {
  COLORS,
  FRAMES,
  ANIMATIONS,
  CAGE_OVERLAY,
} from "./lobster-frames.js";

/** Generate the dashboard HTML */
export function generateDashboardHtml(): string {
  // Serialize frame data for embedding in JS
  const framesJson = JSON.stringify(FRAMES);
  const colorsJson = JSON.stringify(COLORS);
  const cageJson = JSON.stringify(CAGE_OVERLAY);
  const animationsJson = JSON.stringify(ANIMATIONS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LOBSTERCAGE Dashboard</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --matrix-green: #00ff41;
      --matrix-dark: #003300;
      --matrix-glow: #00ff4180;
      --bg-dark: #0a0a0a;
      --bg-panel: #0d1a0d;
      --border-pixel: #004400;
      --text-dim: #006600;
      --alert-red: #ff3333;
      --alert-orange: #ff6600;
    }

    body {
      font-family: 'VT323', monospace;
      background: var(--bg-dark);
      color: var(--matrix-green);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Scanline overlay */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.3) 2px,
        rgba(0, 0, 0, 0.3) 4px
      );
      pointer-events: none;
      z-index: 1000;
    }

    /* CRT glow effect */
    body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%);
      pointer-events: none;
      z-index: 999;
    }

    .header {
      text-align: center;
      padding: 20px;
      border-bottom: 4px solid var(--border-pixel);
      background: var(--bg-panel);
    }

    .header h1 {
      font-family: 'Press Start 2P', cursive;
      font-size: 24px;
      text-shadow: 0 0 10px var(--matrix-glow);
      letter-spacing: 4px;
    }

    .header .subtitle {
      font-size: 18px;
      color: var(--text-dim);
      margin-top: 8px;
    }

    .container {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 20px;
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .panel {
      background: var(--bg-panel);
      border: 4px solid var(--border-pixel);
      padding: 16px;
      position: relative;
    }

    .panel::before {
      content: '';
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      bottom: 4px;
      border: 2px solid var(--matrix-dark);
      pointer-events: none;
    }

    .panel-title {
      font-family: 'Press Start 2P', cursive;
      font-size: 12px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px dashed var(--border-pixel);
    }

    /* Lobster viewport */
    .lobster-viewport {
      height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    #lobster-canvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    #three-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    /* Stats cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      padding: 12px;
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: bold;
      text-shadow: 0 0 8px var(--matrix-glow);
    }

    .stat-label {
      font-size: 14px;
      color: var(--text-dim);
      margin-top: 4px;
    }

    .stat-card.alert .stat-value {
      color: var(--alert-orange);
      text-shadow: 0 0 8px var(--alert-orange);
    }

    .stat-card.critical .stat-value {
      color: var(--alert-red);
      text-shadow: 0 0 8px var(--alert-red);
    }

    /* Chart */
    .chart-container {
      height: 150px;
      position: relative;
      margin: 20px 0;
    }

    #violations-chart {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }

    /* Time filter */
    .time-filter {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .time-btn {
      font-family: 'VT323', monospace;
      font-size: 16px;
      padding: 8px 16px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      color: var(--text-dim);
      cursor: pointer;
      transition: all 0.2s;
    }

    .time-btn:hover, .time-btn.active {
      background: var(--matrix-dark);
      color: var(--matrix-green);
      border-color: var(--matrix-green);
    }

    /* Rules list */
    .rules-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .rule-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px dashed var(--border-pixel);
    }

    .rule-item:last-child {
      border-bottom: none;
    }

    .rule-info {
      flex: 1;
    }

    .rule-id {
      font-size: 16px;
    }

    .rule-category {
      font-size: 12px;
      color: var(--text-dim);
    }

    .rule-controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* Toggle switch */
    .toggle {
      width: 48px;
      height: 24px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      cursor: pointer;
      position: relative;
    }

    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: var(--text-dim);
      transition: all 0.2s;
    }

    .toggle.on::after {
      left: 26px;
      background: var(--matrix-green);
    }

    /* Action dropdown */
    .action-select {
      font-family: 'VT323', monospace;
      font-size: 14px;
      padding: 4px 8px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      color: var(--matrix-green);
      cursor: pointer;
    }

    .action-select option {
      background: var(--bg-dark);
    }

    /* Top rules */
    .top-rules {
      margin-top: 16px;
    }

    .top-rule {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px dashed var(--border-pixel);
    }

    .top-rule-bar {
      flex: 1;
      height: 16px;
      background: var(--bg-dark);
      margin: 0 12px;
      position: relative;
    }

    .top-rule-fill {
      height: 100%;
      background: var(--matrix-green);
      transition: width 0.3s;
    }

    .top-rule-count {
      min-width: 40px;
      text-align: right;
    }

    /* Add rule button */
    .add-rule-btn {
      font-family: 'VT323', monospace;
      font-size: 16px;
      width: 100%;
      padding: 12px;
      margin-top: 16px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      color: var(--matrix-green);
      cursor: pointer;
      transition: all 0.2s;
    }

    .add-rule-btn:hover {
      background: var(--matrix-dark);
      border-color: var(--matrix-green);
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .modal-overlay.show {
      display: flex;
    }

    .modal {
      background: var(--bg-panel);
      border: 4px solid var(--border-pixel);
      padding: 24px;
      min-width: 400px;
    }

    .modal h2 {
      font-family: 'Press Start 2P', cursive;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-dim);
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      font-family: 'VT323', monospace;
      font-size: 16px;
      width: 100%;
      padding: 8px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      color: var(--matrix-green);
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }

    .modal-actions button {
      font-family: 'VT323', monospace;
      font-size: 16px;
      flex: 1;
      padding: 12px;
      cursor: pointer;
      border: 2px solid var(--border-pixel);
    }

    .btn-cancel {
      background: var(--bg-dark);
      color: var(--text-dim);
    }

    .btn-save {
      background: var(--matrix-dark);
      color: var(--matrix-green);
    }

    /* Guard status */
    .guard-status {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--bg-dark);
      border: 2px solid var(--border-pixel);
      margin-bottom: 16px;
    }

    .status-indicator {
      width: 16px;
      height: 16px;
      background: var(--matrix-green);
      box-shadow: 0 0 8px var(--matrix-glow);
      animation: pulse 2s infinite;
    }

    .status-indicator.inactive {
      background: var(--alert-red);
      box-shadow: 0 0 8px var(--alert-red);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Responsive */
    @media (max-width: 900px) {
      .container {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>LOBSTERCAGE</h1>
    <div class="subtitle">Security Dashboard v1.0</div>
  </header>

  <div class="container">
    <main>
      <!-- Lobster Animation Panel -->
      <div class="panel">
        <div class="panel-title">GUARD STATUS</div>
        <div class="lobster-viewport">
          <div id="three-container"></div>
          <canvas id="lobster-canvas" width="256" height="192"></canvas>
        </div>
        <div class="guard-status">
          <div class="status-indicator" id="guard-indicator"></div>
          <span id="guard-text">Guard Active</span>
        </div>
      </div>

      <!-- Stats Panel -->
      <div class="panel">
        <div class="panel-title">STATISTICS</div>
        <div class="time-filter">
          <button class="time-btn active" data-days="7">7D</button>
          <button class="time-btn" data-days="30">30D</button>
          <button class="time-btn" data-days="90">90D</button>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" id="total-scans">0</div>
            <div class="stat-label">Total Scans</div>
          </div>
          <div class="stat-card" id="violations-card">
            <div class="stat-value" id="total-violations">0</div>
            <div class="stat-label">Violations</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="blocked-count">0</div>
            <div class="stat-label">Blocked</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="days-active">0</div>
            <div class="stat-label">Days Active</div>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="violations-chart"></canvas>
        </div>
        <div class="panel-title" style="margin-top: 20px;">TOP TRIGGERED RULES</div>
        <div class="top-rules" id="top-rules"></div>
      </div>
    </main>

    <!-- Rules Sidebar -->
    <aside>
      <div class="panel">
        <div class="panel-title">RULE CONFIGURATION</div>
        <div class="rules-list" id="rules-list"></div>
        <button class="add-rule-btn" id="add-rule-btn">+ ADD CUSTOM RULE</button>
      </div>
    </aside>
  </div>

  <!-- Add Rule Modal -->
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <h2>ADD CUSTOM RULE</h2>
      <div class="form-group">
        <label>Rule ID</label>
        <input type="text" id="rule-id" placeholder="custom-my-rule">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="rule-category">
          <option value="pii">PII</option>
          <option value="content">Content</option>
        </select>
      </div>
      <div class="form-group">
        <label>Action</label>
        <select id="rule-action">
          <option value="warn">Warn</option>
          <option value="block">Block</option>
          <option value="shutdown">Shutdown</option>
        </select>
      </div>
      <div class="form-group">
        <label>Pattern (Regex)</label>
        <input type="text" id="rule-pattern" placeholder="secret\\w+">
      </div>
      <div class="form-group">
        <label>Keywords (comma-separated)</label>
        <textarea id="rule-keywords" rows="3" placeholder="password, secret, token"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" id="modal-cancel">CANCEL</button>
        <button class="btn-save" id="modal-save">SAVE</button>
      </div>
    </div>
  </div>

  <script>
    // Embedded pixel art data
    const FRAMES = ${framesJson};
    const COLORS = ${colorsJson};
    const CAGE_OVERLAY = ${cageJson};
    const ANIMATIONS = ${animationsJson};

    // State
    let currentDays = 7;
    let stats = null;
    let rules = [];
    let currentAnimation = 'idle';
    let currentFrameIndex = 0;
    let animationTimer = null;

    // DOM Elements
    const lobsterCanvas = document.getElementById('lobster-canvas');
    const lobsterCtx = lobsterCanvas.getContext('2d');
    const chartCanvas = document.getElementById('violations-chart');
    const chartCtx = chartCanvas.getContext('2d');

    // Render pixel art frame
    function renderFrame(frameKey, scale = 8) {
      const frame = FRAMES[frameKey];
      if (!frame) return;

      lobsterCtx.clearRect(0, 0, lobsterCanvas.width, lobsterCanvas.height);

      // Center offset
      const offsetX = (lobsterCanvas.width - 32 * scale) / 2;
      const offsetY = (lobsterCanvas.height - 24 * scale) / 2;

      // Draw lobster
      frame.forEach((row, y) => {
        row.forEach((colorKey, x) => {
          const color = COLORS[colorKey];
          if (color) {
            lobsterCtx.fillStyle = color;
            lobsterCtx.fillRect(
              offsetX + x * scale,
              offsetY + y * scale,
              scale,
              scale
            );
          }
        });
      });

      // Draw cage bars
      CAGE_OVERLAY.forEach(bar => {
        const color = bar.color === 'G' ? '#00ff41' : '#004400';
        lobsterCtx.fillStyle = color;
        for (let y = 0; y < 24; y++) {
          lobsterCtx.fillRect(
            offsetX + bar.x * scale,
            offsetY + y * scale,
            scale,
            scale
          );
        }
      });

      // Add glow effect to cage
      lobsterCtx.shadowColor = '#00ff41';
      lobsterCtx.shadowBlur = 10;
    }

    // Animation loop
    function startAnimation(animName = 'idle') {
      if (animationTimer) clearInterval(animationTimer);
      currentAnimation = animName;
      currentFrameIndex = 0;

      const frames = ANIMATIONS[animName];
      const speed = animName === 'idle' ? 400 : animName === 'alert' ? 100 : 150;

      renderFrame(frames[0]);

      animationTimer = setInterval(() => {
        currentFrameIndex = (currentFrameIndex + 1) % frames.length;
        renderFrame(frames[currentFrameIndex]);
      }, speed);
    }

    // Trigger alert animation
    function triggerAlert() {
      startAnimation('alert');
      setTimeout(() => startAnimation('idle'), 800);
    }

    // Render chart
    function renderChart(summaries) {
      const canvas = chartCanvas;
      const ctx = chartCtx;
      const width = canvas.width = canvas.parentElement.offsetWidth;
      const height = canvas.height = canvas.parentElement.offsetHeight;

      ctx.clearRect(0, 0, width, height);

      if (!summaries || summaries.length === 0) {
        ctx.fillStyle = '#006600';
        ctx.font = '16px VT323';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', width / 2, height / 2);
        return;
      }

      const maxViolations = Math.max(...summaries.map(s => s.totalViolations), 1);
      const barWidth = Math.floor((width - 40) / summaries.length);
      const padding = 20;

      // Draw grid lines
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding + (height - padding * 2) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }

      // Draw bars (pixel-art style)
      summaries.forEach((summary, i) => {
        const barHeight = (summary.totalViolations / maxViolations) * (height - padding * 2);
        const x = padding + i * barWidth + 4;
        const y = height - padding - barHeight;

        // Pixel-style bar
        ctx.fillStyle = summary.totalViolations > 0 ? '#00ff41' : '#004400';
        for (let py = 0; py < barHeight; py += 4) {
          ctx.fillRect(x, y + py, barWidth - 8, 3);
        }

        // Square dot on top
        if (summary.totalViolations > 0) {
          ctx.fillStyle = '#00ff41';
          ctx.shadowColor = '#00ff41';
          ctx.shadowBlur = 4;
          ctx.fillRect(x + barWidth / 2 - 6, y - 4, 8, 8);
          ctx.shadowBlur = 0;
        }
      });
    }

    // Render top rules
    function renderTopRules(topRules) {
      const container = document.getElementById('top-rules');
      if (!topRules || topRules.length === 0) {
        container.innerHTML = '<div style="color: #006600; padding: 16px;">No violations recorded</div>';
        return;
      }

      const maxCount = Math.max(...topRules.map(r => r.count));

      container.innerHTML = topRules.map(rule => {
        const percentage = (rule.count / maxCount) * 100;
        return \`
          <div class="top-rule">
            <span class="top-rule-id" style="min-width: 120px;">\${rule.ruleId}</span>
            <div class="top-rule-bar">
              <div class="top-rule-fill" style="width: \${percentage}%"></div>
            </div>
            <span class="top-rule-count">\${rule.count}</span>
          </div>
        \`;
      }).join('');
    }

    // Render rules list
    function renderRules(allRules, customRules) {
      const container = document.getElementById('rules-list');
      const combined = [...allRules, ...customRules.map(r => ({ ...r, isCustom: true }))];

      container.innerHTML = combined.map(rule => \`
        <div class="rule-item" data-rule-id="\${rule.id}">
          <div class="rule-info">
            <div class="rule-id">\${rule.id}\${rule.isCustom ? ' <span style="color: #ff6600;">[custom]</span>' : ''}</div>
            <div class="rule-category">\${rule.category.toUpperCase()}</div>
          </div>
          <div class="rule-controls">
            <select class="action-select" data-rule-id="\${rule.id}">
              <option value="warn" \${rule.action === 'warn' ? 'selected' : ''}>Warn</option>
              <option value="block" \${rule.action === 'block' ? 'selected' : ''}>Block</option>
              <option value="shutdown" \${rule.action === 'shutdown' ? 'selected' : ''}>Shutdown</option>
            </select>
            <div class="toggle \${rule.enabled ? 'on' : ''}" data-rule-id="\${rule.id}"></div>
          </div>
        </div>
      \`).join('');

      // Add event listeners
      container.querySelectorAll('.toggle').forEach(toggle => {
        toggle.addEventListener('click', async () => {
          const ruleId = toggle.dataset.ruleId;
          const isOn = toggle.classList.toggle('on');
          await updateRule(ruleId, { enabled: isOn });
        });
      });

      container.querySelectorAll('.action-select').forEach(select => {
        select.addEventListener('change', async () => {
          const ruleId = select.dataset.ruleId;
          await updateRule(ruleId, { action: select.value });
        });
      });
    }

    // Update stats display
    function updateStatsDisplay(data) {
      document.getElementById('total-scans').textContent = data.totalScans || 0;
      document.getElementById('total-violations').textContent = data.totalViolations || 0;

      // Calculate blocked (actions that were 'block' or 'shutdown')
      let blocked = 0;
      if (data.recentEvents) {
        data.recentEvents.forEach(event => {
          event.violations.forEach(v => {
            if (v.action === 'block' || v.action === 'shutdown') {
              blocked += v.count;
            }
          });
        });
      }
      document.getElementById('blocked-count').textContent = blocked;
      document.getElementById('days-active').textContent = data.summaries?.length || 0;

      // Update violation card style
      const violationsCard = document.getElementById('violations-card');
      if (data.totalViolations > 10) {
        violationsCard.classList.add('critical');
        violationsCard.classList.remove('alert');
      } else if (data.totalViolations > 0) {
        violationsCard.classList.add('alert');
        violationsCard.classList.remove('critical');
      } else {
        violationsCard.classList.remove('alert', 'critical');
      }

      // Trigger alert animation if violations found
      if (data.totalViolations > 0) {
        triggerAlert();
      }
    }

    // API calls
    async function fetchStats(days) {
      try {
        const res = await fetch(\`/api/stats?days=\${days}\`);
        const json = await res.json();
        if (json.success) {
          stats = json.data;
          updateStatsDisplay(stats);
          renderChart(stats.summaries);
          renderTopRules(stats.topRules);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    }

    async function fetchRules() {
      try {
        const res = await fetch('/api/rules');
        const json = await res.json();
        if (json.success) {
          rules = json.data;
          renderRules(rules.rules, rules.customRules);
        }
      } catch (err) {
        console.error('Failed to fetch rules:', err);
      }
    }

    async function updateRule(ruleId, updates) {
      try {
        const res = await fetch('/api/rules/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleId, updates })
        });
        const json = await res.json();
        if (!json.success) {
          console.error('Failed to update rule:', json.error);
        }
      } catch (err) {
        console.error('Failed to update rule:', err);
      }
    }

    async function addRule(rule) {
      try {
        const res = await fetch('/api/rules/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule })
        });
        const json = await res.json();
        if (json.success) {
          await fetchRules();
        }
      } catch (err) {
        console.error('Failed to add rule:', err);
      }
    }

    // Event listeners
    document.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDays = parseInt(btn.dataset.days);
        fetchStats(currentDays);
      });
    });

    document.getElementById('add-rule-btn').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.add('show');
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.remove('show');
    });

    document.getElementById('modal-save').addEventListener('click', async () => {
      const rule = {
        id: document.getElementById('rule-id').value,
        category: document.getElementById('rule-category').value,
        action: document.getElementById('rule-action').value,
        enabled: true,
        pattern: document.getElementById('rule-pattern').value || undefined,
        keywords: document.getElementById('rule-keywords').value
          ? document.getElementById('rule-keywords').value.split(',').map(k => k.trim())
          : undefined
      };

      if (rule.id) {
        await addRule(rule);
        document.getElementById('modal-overlay').classList.remove('show');
        // Clear form
        document.getElementById('rule-id').value = '';
        document.getElementById('rule-pattern').value = '';
        document.getElementById('rule-keywords').value = '';
      }
    });

    // Matrix rain effect (Three.js)
    function initMatrixRain() {
      const container = document.getElementById('three-container');
      if (!container) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ alpha: true });
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      container.appendChild(renderer.domElement);

      // Create matrix rain particles
      const particleCount = 200;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const velocities = [];

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = Math.random() * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        velocities.push(0.05 + Math.random() * 0.1);
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: 0x00ff41,
        size: 0.3,
        transparent: true,
        opacity: 0.6
      });

      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      camera.position.z = 15;

      function animate() {
        requestAnimationFrame(animate);

        const positions = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3 + 1] -= velocities[i];
          if (positions[i * 3 + 1] < -15) {
            positions[i * 3 + 1] = 15;
          }
        }
        particles.geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      }

      animate();
    }

    // Initialize
    startAnimation('idle');
    fetchStats(currentDays);
    fetchRules();
    initMatrixRain();

    // Refresh data periodically
    setInterval(() => fetchStats(currentDays), 30000);
  </script>
</body>
</html>`;
}
