# Plan: Status Command with Web Dashboard

## Overview

Add `npx lobstercage status` command with a Matrix-style web dashboard featuring:
- **Pixel art lobster-in-cage animation** (Canvas 2D + Three.js)
- Rule configuration UI
- Stats over time (local JSON storage)
- 8-bit aesthetic with scanlines, pixel borders, and matrix rain

---

## File Structure

```
src/
  commands/status.ts           # NEW: CLI status command
  stats/
    types.ts                   # NEW: Stats type definitions
    storage.ts                 # NEW: JSON persistence layer
    rules-config.ts            # NEW: Rule config management
  dashboard/
    server.ts                  # NEW: HTTP server (Node built-in)
    html.ts                    # NEW: Embedded HTML/CSS/JS
    lobster-frames.ts          # NEW: ASCII art animation frames
    api.ts                     # NEW: API route handlers
  cli.ts                       # UPDATE: Add status command
```

Storage location: `~/.openclaw/lobstercage/stats.json`

---

## Implementation Steps

### 1. Stats Storage Layer

**Create `src/stats/types.ts`:**
```typescript
export type ScanEvent = {
  id: string;
  timestamp: string;
  type: "forensic" | "guard" | "audit";
  violations: ViolationEvent[];
};

export type ViolationEvent = {
  ruleId: string;
  category: "pii" | "content";
  action: "warn" | "block" | "shutdown";
  count: number;
};

export type DailySummary = {
  date: string;  // YYYY-MM-DD
  totalScans: number;
  totalViolations: number;
  violationsByRule: Record<string, number>;
};

export type StatsDatabase = {
  version: 1;
  events: ScanEvent[];
  dailySummaries: DailySummary[];
  ruleConfig: { rules: StoredRule[]; customRules: StoredRule[] };
};
```

**Create `src/stats/storage.ts`:**
- `getStatsDir()` - uses `getStateDir()` from config-loader.ts
- `loadStats()` / `saveStats()` - atomic JSON read/write
- `recordScanEvent()` - append event + update daily summary

### 2. CLI Status Command

**Create `src/commands/status.ts`:**
```bash
lobstercage status [options]
  --json        Output as JSON
  --dashboard   Open web dashboard
  --port <n>    Dashboard port (default: 8888)
  --days <n>    Stats for last N days (default: 7)
```

Terminal output shows:
- Guard status (installed/not)
- Violation counts (last N days)
- ASCII sparkline chart
- Top triggered rules

**Update `src/cli.ts`:**
- Add "status" command to parser
- Route to `runStatus()`

### 3. Pixel Art Lobster Frames

**Create `src/dashboard/lobster-frames.ts`:**

Use 2D pixel arrays with hex colors (Canvas 2D rendering):

**Color Palette:**
```typescript
const COLORS = {
  _: null,           // transparent
  K: '#000000',      // black outline
  D: '#c43c00',      // dark red (shading)
  R: '#e85000',      // orange-red (body)
  O: '#ff6600',      // bright orange (highlights)
  L: '#ff9933',      // light orange (bright spots)
};
```

**Frame structure (~32x32 pixels):**
```typescript
// Each frame is a 2D array of color keys
const LOBSTER_IDLE_1: string[][] = [
  ['_','_','_','K','K','_','_','_','_','_','_','_',...],
  ['_','_','K','O','O','K','_','_','_','_','_','_',...],
  ['_','K','O','L','O','O','K','_','_','_','_','_',...],
  // ... ~32 rows defining the full lobster
];
```

**Animation frames (6 total):**
- `IDLE_1`, `IDLE_2` - subtle leg movement
- `CLAW_OPEN`, `CLAW_CLOSE` - claw snap animation
- `WALK_1`, `WALK_2` - walking cycle

**Cage frame (pixel art):**
```typescript
// Green matrix-style cage bars rendered as pixels
const CAGE_PIXELS: string[][] = [
  // Vertical bars with glow effect
  // Semi-transparent overlay
];
```

**Render function:**
```typescript
function renderPixelArt(ctx: CanvasRenderingContext2D,
                        frame: string[][],
                        scale: number = 4) {
  frame.forEach((row, y) => {
    row.forEach((colorKey, x) => {
      const color = COLORS[colorKey];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    });
  });
}
```

### 4. Web Dashboard Server

**Create `src/dashboard/server.ts`:**
- Node.js built-in `http` module (zero deps)
- Serves embedded HTML at `/`
- API endpoints:
  - `GET /api/stats` - return stats database
  - `GET /api/rules` - return rule config
  - `POST /api/rules/update` - save rule changes
- Auto-opens browser on start

**Create `src/dashboard/html.ts`:**
Single embedded HTML string with inline CSS/JS:
- Matrix green (#00ff41) color scheme
- Scanline overlay effect
- Pixel-art borders
- Three.js loaded from CDN

### 5. Three.js Pixel Art Animation

In dashboard JS:
```javascript
class LobsterCageScene {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, ...);
    this.renderer = new THREE.WebGLRenderer({ alpha: true });

    // Create offscreen canvas for pixel art
    this.pixelCanvas = document.createElement('canvas');
    this.pixelCanvas.width = 128;  // 32px * 4 scale
    this.pixelCanvas.height = 128;
    this.pixelCtx = this.pixelCanvas.getContext('2d');

    // Render initial frame to canvas
    renderPixelArt(this.pixelCtx, LOBSTER_IDLE_1, 4);

    // Create Three.js texture from canvas
    this.lobsterTexture = new THREE.CanvasTexture(this.pixelCanvas);
    this.lobsterTexture.magFilter = THREE.NearestFilter; // Keep pixels crisp!

    // Create plane with texture
    const geometry = new THREE.PlaneGeometry(20, 20);
    const material = new THREE.MeshBasicMaterial({
      map: this.lobsterTexture,
      transparent: true,
    });
    this.lobsterMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.lobsterMesh);

    // Matrix rain particles
    this.particles = this.createMatrixRain();
    this.scene.add(this.particles);

    // Cage bars (green glowing lines)
    this.cage = this.createCage();
    this.scene.add(this.cage);
  }

  updateFrame(frameData) {
    // Clear and redraw pixel art
    this.pixelCtx.clearRect(0, 0, 128, 128);
    renderPixelArt(this.pixelCtx, frameData, 4);
    this.lobsterTexture.needsUpdate = true;
  }

  triggerAlert() {
    // Play claw snap animation
    this.playAnimation([CLAW_OPEN, CLAW_CLOSE, CLAW_OPEN, CLAW_CLOSE], 100);
  }
}
```

Animation timing:
- Idle: 300ms/frame (gentle movement)
- Alert: 100ms/frame (rapid claw snap)
- Walk: 150ms/frame (scuttling)

### 6. Rule Configuration UI

Dashboard panel showing:
- List of all rules (built-in + custom)
- Toggle switch for enable/disable
- Dropdown for action (warn/block/shutdown)
- "Add Custom Rule" button with modal form

**Create `src/stats/rules-config.ts`:**
- `loadRuleConfig()` - merge defaults with stored overrides
- `updateRuleConfig()` - save changes to stats.json

### 7. Stats Visualization

Canvas-based 8-bit style charts:
- Violations over time (line chart with square dots)
- Time range filters: 7D / 30D / 90D
- Summary cards: Total Scans, Violations, Blocked, Guard Status
- Category breakdown horizontal bars

### 8. Integration

Update `src/commands/catch.ts`:
- After scan completes, call `recordScanEvent()`
- Pass violations array and scan metadata

---

## Key Files to Reference

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI parser pattern to follow |
| `src/audit/config-loader.ts` | Reuse `getStateDir()` |
| `src/ui/matrix.ts` | Reuse `style.*` utilities |
| `src/scanner/types.ts` | Type patterns for consistency |
| `src/commands/catch.ts` | Integration point for stats |

---

## Dependencies

**No new npm dependencies.** Uses:
- Node.js `http` module for server
- Node.js `fs/promises` for storage
- Three.js from CDN (browser only)
- Canvas API for charts (browser built-in)

---

## Verification

1. **CLI status works:**
   ```bash
   npx lobstercage status
   npx lobstercage status --json
   npx lobstercage status --days 30
   ```

2. **Dashboard launches:**
   ```bash
   npx lobstercage status --dashboard
   # Browser opens to http://localhost:8888
   ```

3. **Pixel art lobster animation runs:**
   - Cage renders with matrix rain particles
   - Lobster displays in crisp pixel art (NearestFilter)
   - Idle animation cycles through leg movement
   - Trigger alert to see claw snap animation

4. **Rules UI:**
   - Toggle a rule off, refresh, verify persisted
   - Change action level, verify saved
   - Add custom rule, verify appears

5. **Stats tracking:**
   - Run `lobstercage catch`
   - Run `lobstercage status` - see scan recorded
   - Check `~/.openclaw/lobstercage/stats.json`
