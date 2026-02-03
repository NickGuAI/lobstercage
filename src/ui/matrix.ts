// Minimal Matrix-themed terminal UI

const GREEN = "\x1b[32m";
const BRIGHT = "\x1b[92m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";

export const style = {
  green: (s: string) => `${GREEN}${s}${RESET}`,
  bright: (s: string) => `${BRIGHT}${s}${RESET}`,
  dim: (s: string) => `${DIM}${GREEN}${s}${RESET}`,
  bold: (s: string) => `${BOLD}${BRIGHT}${s}${RESET}`,
  muted: (s: string) => `${DIM}${s}${RESET}`,
  error: (s: string) => `\x1b[91m${s}${RESET}`,
  warn: (s: string) => `\x1b[93m${s}${RESET}`,
};

const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789";

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Flowing Matrix stream animation */
export async function matrixFlow(durationMs = 1500): Promise<void> {
  if (!process.stdout.isTTY) return;

  const width = Math.min(process.stdout.columns || 80, 100);
  const height = 12;

  // Track drop positions and speeds
  const drops: { col: number; row: number; speed: number; chars: string[] }[] = [];
  for (let i = 0; i < Math.floor(width / 2); i++) {
    drops.push({
      col: Math.floor(Math.random() * width),
      row: Math.floor(Math.random() * height) - height,
      speed: 0.3 + Math.random() * 0.7,
      chars: Array.from({ length: 8 }, () => randomGlyph()),
    });
  }

  process.stdout.write(HIDE_CURSOR);
  process.stdout.write("\n".repeat(height));

  const startTime = Date.now();
  const frameMs = 50;

  while (Date.now() - startTime < durationMs) {
    // Build frame
    const grid: string[][] = Array.from({ length: height }, () =>
      new Array(width).fill(" ")
    );

    for (const drop of drops) {
      const headRow = Math.floor(drop.row);
      for (let i = 0; i < drop.chars.length; i++) {
        const r = headRow - i;
        if (r >= 0 && r < height && drop.col < width) {
          if (i === 0) {
            grid[r][drop.col] = `${BOLD}${BRIGHT}${drop.chars[i]}${RESET}`;
          } else if (i < 3) {
            grid[r][drop.col] = `${BRIGHT}${drop.chars[i]}${RESET}`;
          } else {
            grid[r][drop.col] = `${DIM}${GREEN}${drop.chars[i]}${RESET}`;
          }
        }
      }
      drop.row += drop.speed;
      // Reset when off screen
      if (headRow - drop.chars.length > height) {
        drop.row = -Math.floor(Math.random() * height);
        drop.col = Math.floor(Math.random() * width);
        drop.chars = Array.from({ length: 6 + Math.floor(Math.random() * 4) }, () =>
          randomGlyph()
        );
      }
      // Shift chars occasionally
      if (Math.random() < 0.1) {
        drop.chars[Math.floor(Math.random() * drop.chars.length)] = randomGlyph();
      }
    }

    // Move cursor up and render
    process.stdout.write(`\x1b[${height}A`);
    for (let r = 0; r < height; r++) {
      process.stdout.write(CLEAR_LINE + grid[r].join("") + "\n");
    }

    await sleep(frameMs);
  }

  // Clear the animation area
  process.stdout.write(`\x1b[${height}A`);
  for (let i = 0; i < height; i++) {
    process.stdout.write(CLEAR_LINE + "\n");
  }
  process.stdout.write(`\x1b[${height}A`);
  process.stdout.write(SHOW_CURSOR);
}

/** Simple spinning loader for scanning */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private index = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    if (!process.stdout.isTTY) {
      console.log(this.message);
      return;
    }
    process.stdout.write(HIDE_CURSOR);
    this.interval = setInterval(() => {
      const frame = this.frames[this.index % this.frames.length];
      process.stdout.write(`\r${CLEAR_LINE}${style.bright(frame)} ${style.dim(this.message)}`);
      this.index++;
    }, 80);
  }

  update(message: string): void {
    this.message = message;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(`\r${CLEAR_LINE}`);
    if (finalMessage) {
      console.log(`${style.bright("✓")} ${style.green(finalMessage)}`);
    }
    process.stdout.write(SHOW_CURSOR);
  }
}

/** Print minimal header */
export function printHeader(): void {
  console.log();
  console.log(style.bold("  LOBSTERCAGE"));
  console.log(style.dim("  Security Scanner for OpenClaw"));
  console.log();
}
