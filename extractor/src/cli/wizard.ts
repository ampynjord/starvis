import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { GAME_ENVS, NETWORK_MODULES, P4K_MODULES, VALID_MODULES } from '../module-registry.js';
import { main } from './main.js';

/**
 * Lightweight interactive "thick client" for the extractor CLI.
 *
 * Walks the operator through every meaningful option (environment, modules,
 * safety flags, network tuning) and builds the exact `extract.ts` argument
 * list. The operator can review the generated command before running it,
 * which makes the extractor approachable without memorising flags.
 *
 * Zero extra dependencies: it only uses Node's built-in readline.
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
} as const;

const useColor = output.isTTY && !process.env.NO_COLOR;
function paint(color: keyof typeof COLORS, text: string): string {
  return useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

interface Prompter {
  ask(question: string): Promise<string>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  close(): void;
}

function createPrompter(): Prompter {
  const rl = createInterface({ input, output });
  return {
    async ask(question: string): Promise<string> {
      return (await rl.question(question)).trim();
    },
    async confirm(question: string, defaultYes = false): Promise<boolean> {
      const hint = defaultYes ? '[Y/n]' : '[y/N]';
      const answer = (await rl.question(`${question} ${paint('dim', hint)} `)).trim().toLowerCase();
      if (!answer) return defaultYes;
      return answer === 'y' || answer === 'yes' || answer === 'o' || answer === 'oui';
    },
    close(): void {
      rl.close();
    },
  };
}

async function pickEnv(p: Prompter): Promise<string> {
  console.log(paint('bold', '\nGame environment'));
  GAME_ENVS.forEach((env, i) => {
    console.log(`  ${paint('cyan', String(i + 1))}. ${env}`);
  });
  while (true) {
    const raw = await p.ask(`Select environment ${paint('dim', '[1]')} `);
    if (!raw) return GAME_ENVS[0];
    const index = Number.parseInt(raw, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < GAME_ENVS.length) {
      return GAME_ENVS[index];
    }
    if (GAME_ENVS.includes(raw as (typeof GAME_ENVS)[number])) return raw;
    console.log(paint('red', '  Invalid choice, try again.'));
  }
}

async function pickModules(p: Prompter): Promise<string[]> {
  console.log(paint('bold', '\nModules'));
  const p4k = VALID_MODULES.filter((m) => P4K_MODULES.has(m));
  const network = VALID_MODULES.filter((m) => NETWORK_MODULES.has(m));
  console.log(paint('dim', '  P4K (game files):'));
  p4k.forEach((m, i) => {
    console.log(`    ${paint('cyan', String(i + 1))}. ${m}`);
  });
  console.log(paint('dim', '  Network (RSI / web):'));
  network.forEach((m, i) => {
    console.log(`    ${paint('cyan', String(p4k.length + i + 1))}. ${m}`);
  });
  console.log(paint('dim', "  Enter 'all' for everything, or comma-separated numbers/names."));

  const ordered = [...p4k, ...network];
  while (true) {
    const raw = await p.ask(`Select modules ${paint('dim', '[all]')} `);
    if (!raw || raw.toLowerCase() === 'all') return [];
    const tokens = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const selected: string[] = [];
    let invalid = false;
    for (const token of tokens) {
      const index = Number.parseInt(token, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < ordered.length) {
        selected.push(ordered[index]);
      } else if (VALID_MODULES.includes(token as (typeof VALID_MODULES)[number])) {
        selected.push(token);
      } else {
        console.log(paint('red', `  Unknown module: ${token}`));
        invalid = true;
      }
    }
    if (!invalid && selected.length) return [...new Set(selected)];
  }
}

function usesNetwork(modules: string[]): boolean {
  if (modules.length === 0) return true; // 'all'
  return modules.some((m) => NETWORK_MODULES.has(m as (typeof VALID_MODULES)[number]));
}

async function buildArgs(p: Prompter): Promise<string[]> {
  const args: string[] = [];

  const env = await pickEnv(p);
  args.push('--env', env);

  const modules = await pickModules(p);
  if (modules.length) args.push('--modules', modules.join(','));

  console.log(paint('bold', '\nSafety & target'));
  if (await p.confirm('Dry run (parse only, no DB writes)?')) {
    args.push('--dry-run');
  } else if (await p.confirm(paint('yellow', 'Use the PRODUCTION database?'))) {
    args.push('--prod-db');
  }

  if (await p.confirm('Only validate configuration (--check-config)?')) {
    args.push('--check-config');
  }

  if (usesNetwork(modules)) {
    console.log(paint('bold', '\nNetwork tuning'));
    const concurrency = await p.ask(`Scraper concurrency ${paint('dim', '[default]')} `);
    if (concurrency && Number.parseInt(concurrency, 10) > 0) {
      args.push('--concurrency', String(Number.parseInt(concurrency, 10)));
    }
    if (modules.length === 0 || modules.includes('ctm')) {
      if (await p.confirm('Force re-scrape every ship (--ctm-force)?')) args.push('--ctm-force');
    }
  }

  console.log(paint('bold', '\nLogging'));
  if (await p.confirm('Verbose (debug) logs?')) {
    args.push('--verbose');
  } else if (await p.confirm('Quiet (errors only)?')) {
    args.push('--quiet');
  }

  return args;
}

export async function runWizard(): Promise<void> {
  console.log(paint('bold', paint('cyan', '\n  STARVIS Extractor — interactive wizard')));
  console.log(paint('dim', '  Answer the prompts to build and run an extraction.\n'));

  const p = createPrompter();
  try {
    const args = await buildArgs(p);
    const command = `npx tsx extract.ts ${args.join(' ')}`.trim();

    console.log(paint('bold', '\nGenerated command:'));
    console.log(`  ${paint('green', command)}\n`);

    const run = await p.confirm('Run it now?', true);
    p.close();

    if (!run) {
      console.log(paint('dim', '\nCopy the command above to run it later. Bye!'));
      return;
    }

    console.log(paint('dim', '\nStarting extraction...\n'));
    await main(args);
  } catch (error) {
    p.close();
    if ((error as { code?: string }).code === 'ERR_USE_AFTER_CLOSE') return;
    throw error;
  }
}

const isDirectRun = process.argv[1] !== undefined && (process.argv[1].endsWith('wizard.ts') || process.argv[1].endsWith('wizard.js'));

if (isDirectRun) {
  runWizard().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
