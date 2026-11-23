import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'server', 'shared', 'server.ts'];
const FORBIDDEN_PATTERNS = [
  { regex: /\bdangerouslySetInnerHTML\b/, message: 'Avoid dangerouslySetInnerHTML' },
  { regex: /\beval\s*\(/, message: 'Avoid eval()' },
  { regex: /\bnew\s+Function\b/, message: 'Avoid dynamic Function constructor' },
  { regex: /\.innerHTML\s*=/, message: 'Avoid direct innerHTML assignment' },
  { regex: /:\s*any\b(?!\s*\/\/)/, message: 'Avoid explicit any types' },
];

function collectFiles(target) {
  const full = path.resolve(process.cwd(), target);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  const results = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.join(target, entry.name)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(path.join(full, entry.name));
    }
  }
  return results;
}

const files = ROOTS.flatMap(collectFiles);
const violations = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.regex.test(line)) {
        violations.push(`${rel}:${idx + 1} - ${rule.message}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Code hygiene violations found:\n' + violations.join('\n'));
  process.exit(1);
}

console.log(`Static code check passed (${files.length} files scanned).`);
