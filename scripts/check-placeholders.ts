import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDERS, SCANNED_FILES } from './placeholders.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Finding {
  file: string;
  token: string;
  what: string;
}

function scan(): Finding[] {
  const findings: Finding[] = [];

  for (const relative of SCANNED_FILES) {
    const absolute = join(repoRoot, relative);
    if (!existsSync(absolute)) continue;

    const content = readFileSync(absolute, 'utf8');
    for (const placeholder of PLACEHOLDERS) {
      if (content.includes(placeholder.token)) {
        findings.push({ file: relative, token: placeholder.token, what: placeholder.what });
      }
    }
  }

  return findings;
}

const findings = scan();

if (findings.length === 0) {
  console.log('✓ No template placeholders left.');
  process.exit(0);
}

console.error('✗ Template placeholders are still present:\n');
for (const finding of findings) {
  console.error(`  ${finding.file}: ${finding.token}  (${finding.what})`);
}
console.error('\nRun: npm run new-game -- --name "Your Game" --id "com.you.yourgame"');
process.exit(1);
