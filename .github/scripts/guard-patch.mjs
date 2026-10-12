// Validates the patch produced by the (untrusted) agent job and applies it to the working tree.
// The agent is told to edit tests only; this script is the enforcement, not the prompt.
// Usage: node guard-patch.mjs <agent.patch> <guard.json>
// Always exits 0 after writing <guard.json> = { ok, empty, files, added, removed, errors }.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [patchFile, outFile] = process.argv.slice(2);

const ALLOWED_PATHS = [
  /^backend\/tests\/[A-Za-z0-9._\/-]+\.ts$/,
  /^frontend\/src\/[A-Za-z0-9._\/-]+\.test\.tsx?$/,
];
const FORBIDDEN_HEADERS = [
  /^deleted file mode/, /^rename /, /^copy /, /^old mode/, /^new mode/, /^similarity /,
  /^dissimilarity /, /^Binary files/, /^GIT binary patch/,
];
const FORBIDDEN_ADDED = [
  [/\.(skip|only|todo)\b/, 'adds .skip/.only/.todo'],
  [/@ts-(ignore|nocheck)/, 'adds @ts-ignore/@ts-nocheck'],
  [/eslint-disable/, 'adds eslint-disable'],
  [/child_process|\bexecSync\b|\bspawnSync?\b/, 'uses child_process'],
  [/['"`/]\.env\b/, 'references a .env file'],
];
const MAX_FILES = 25;
const MAX_ADDED_LINES = 2000;

const errors = [];
const files = [];
let added = 0;
let removed = 0;

const patch = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
const empty = patch.trim() === '';

if (!empty) {
  const sections = patch.split(/^(?=diff --git )/m).filter((s) => s.trim() !== '');
  for (const section of sections) {
    const lines = section.split('\n');
    const header = /^diff --git a\/(\S+) b\/(\S+)$/.exec(lines[0]);
    if (!header) { errors.push(`unparseable diff header: ${JSON.stringify(lines[0].slice(0, 80))}`); continue; }
    const [, from, to] = header;
    if (from !== to) { errors.push(`path changed between a/ and b/: ${to}`); continue; }
    if (to.split('/').includes('..') || !ALLOWED_PATHS.some((re) => re.test(to))) {
      errors.push(`path not allowed: ${to}`);
      continue;
    }
    files.push(to);

    const firstHunk = lines.findIndex((l) => l.startsWith('@@'));
    const headerLines = lines.slice(1, firstHunk === -1 ? lines.length : firstHunk);
    for (const l of headerLines) {
      if (FORBIDDEN_HEADERS.some((re) => re.test(l))) errors.push(`${to}: forbidden change (${l})`);
      const mode = /^new file mode (\d+)$/.exec(l);
      if (mode && mode[1] !== '100644') errors.push(`${to}: new file mode ${mode[1]} not allowed`);
    }
    if (firstHunk === -1) { errors.push(`${to}: no content hunks`); continue; }

    let fileAdded = 0, fileRemoved = 0, expectAdded = 0, expectRemoved = 0, casesAdded = 0, casesRemoved = 0;
    for (const l of lines.slice(firstHunk)) {
      if (l.startsWith('+')) {
        fileAdded++;
        const text = l.slice(1);
        for (const [re, why] of FORBIDDEN_ADDED) if (re.test(text)) errors.push(`${to}: ${why}`);
        if (/\bexpect\(/.test(text)) expectAdded++;
        if (/\b(it|test)(\.each\b|\()/.test(text)) casesAdded++;
      } else if (l.startsWith('-')) {
        fileRemoved++;
        const text = l.slice(1);
        if (/\bexpect\(/.test(text)) expectRemoved++;
        if (/\b(it|test)(\.each\b|\()/.test(text)) casesRemoved++;
      }
    }
    // Updating a test may rewrite lines, but it must never end up asserting less.
    if (expectRemoved > expectAdded) errors.push(`${to}: removes more assertions (${expectRemoved}) than it adds (${expectAdded})`);
    if (casesRemoved > casesAdded) errors.push(`${to}: removes more test cases (${casesRemoved}) than it adds (${casesAdded})`);
    added += fileAdded;
    removed += fileRemoved;
  }
  if (files.length > MAX_FILES) errors.push(`too many files (${files.length} > ${MAX_FILES})`);
  if (added > MAX_ADDED_LINES) errors.push(`patch too large (${added} added lines > ${MAX_ADDED_LINES})`);

  if (errors.length === 0) {
    try {
      execFileSync('git', ['apply', '--check', patchFile], { stdio: 'pipe' });
      execFileSync('git', ['apply', patchFile], { stdio: 'pipe' });
    } catch (error) {
      errors.push(`git apply failed: ${String(error.stderr ?? error.message).slice(0, 300)}`);
    }
  }
}

const result = { ok: errors.length === 0, empty, files, added, removed, errors };
writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
