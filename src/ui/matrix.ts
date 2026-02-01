// Matrix-themed terminal UI — green-on-black aesthetic

const BRIGHT_GREEN = "\x1b[92m";
const DARK_GREEN = "\x1b[32m";
const BLACK_BG = "\x1b[40m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export const style = {
  bright: (s: string) => `${BRIGHT_GREEN}${s}${RESET}`,
  dark: (s: string) => `${DARK_GREEN}${s}${RESET}`,
  bold: (s: string) => `${BOLD}${BRIGHT_GREEN}${s}${RESET}`,
  dim: (s: string) => `${DIM}${DARK_GREEN}${s}${RESET}`,
  bg: (s: string) => `${BLACK_BG}${s}${RESET}`,
  tag: (label: string) => `${DARK_GREEN}[${BRIGHT_GREEN}${label}${DARK_GREEN}]${RESET}`,
  alert: (s: string) => `${BOLD}\x1b[91m${s}${RESET}`,
};

const MATRIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789@#$%^&*(){}[]|/<>~`";

function randomChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

/** Brief Matrix rain animation (~2 seconds) */
export async function matrixRain(durationMs = 2000): Promise<void> {
  const cols = Math.min(process.stdout.columns || 80, 120);
  const rows = Math.min(process.stdout.rows || 24, 30);

  // Column state: current row position for each column
  const columnPos = new Array(cols).fill(0).map(() => Math.floor(Math.random() * rows));
  const columnSpeed = new Array(cols).fill(0).map(() => 1 + Math.floor(Math.random() * 3));

  process.stdout.write(HIDE_CURSOR + BLACK_BG + CLEAR_SCREEN);

  const frameInterval = 60;
  const frames = Math.floor(durationMs / frameInterval);

  for (let f = 0; f < frames; f++) {
    let output = "\x1b[H"; // move cursor to top-left
    const grid: string[][] = Array.from({ length: rows }, () => new Array(cols).fill(" "));

    for (let c = 0; c < cols; c++) {
      const headRow = columnPos[c] % (rows + 10);
      // Draw trail
      for (let t = 0; t < 6; t++) {
        const r = headRow - t;
        if (r >= 0 && r < rows) {
          if (t === 0) {
            grid[r][c] = `${BOLD}${BRIGHT_GREEN}${randomChar()}${RESET}${BLACK_BG}`;
          } else if (t < 3) {
            grid[r][c] = `${BRIGHT_GREEN}${randomChar()}${RESET}${BLACK_BG}`;
          } else {
            grid[r][c] = `${DIM}${DARK_GREEN}${randomChar()}${RESET}${BLACK_BG}`;
          }
        }
      }
      columnPos[c] += columnSpeed[c];
    }

    for (let r = 0; r < rows; r++) {
      output += grid[r].join("") + "\n";
    }
    process.stdout.write(output);
    await sleep(frameInterval);
  }

  process.stdout.write(CLEAR_SCREEN + SHOW_CURSOR + RESET);
}

export function printBanner(): void {
  const banner = `
 ██╗      ██████╗ ██████╗ ███████╗████████╗███████╗██████╗  ██████╗ █████╗  ██████╗ ███████╗
 ██║     ██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝ ██╔════╝
 ██║     ██║   ██║██████╔╝███████╗   ██║   █████╗  ██████╔╝██║     ███████║██║  ███╗█████╗
 ██║     ██║   ██║██╔══██╗╚════██║   ██║   ██╔══╝  ██╔══██╗██║     ██╔══██║██║   ██║██╔══╝
 ███████╗╚██████╔╝██████╔╝███████║   ██║   ███████╗██║  ██║╚██████╗██║  ██║╚██████╔╝███████╗
 ╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝╚══════╝`;

  console.log(style.bold(banner));
  console.log(style.dark("  v0.1.0 — OpenClaw Security Scanner\n"));
}

/** Progress bar with Matrix-style green blocks */
export function progressBar(current: number, total: number, width = 40): string {
  const pct = total === 0 ? 1 : current / total;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = style.bright("█".repeat(filled)) + style.dim("░".repeat(empty));
  const percent = style.bright(`${Math.round(pct * 100)}%`);
  return `  ${bar} ${percent}`;
}

/** Write a progress line that overwrites itself */
export function writeProgress(current: number, total: number, label: string): void {
  const bar = progressBar(current, total);
  process.stdout.write(`\r${style.tag("SCAN")} ${style.dark(label)} ${bar}`);
  if (current === total) process.stdout.write("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
