// Turns raw before/after test results into (1) a verdict and (2) the PR comment.
// Runs in the privileged job but only reads files; everything that originates from the agent or
// from PR code (report, test logs, file names) is escaped before it reaches the comment.
// Usage:
//   node report.mjs evaluate <results-dir> <guard.json> <decision.json>
//   node report.mjs render   <results-dir> <guard.json> <decision.json> <agent-report.md> <comment.md>
// `render` reads AGENT_RESULT, PUSH_RESULT, PUSHED_SHA, RUN_URL, HEAD_SHA from the environment.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PACKAGES = ['backend', 'frontend'];
const METRICS = ['statements', 'branches', 'functions', 'lines'];
const MARKER = '<!-- pr-test-agent -->';

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

function load(dir, pkg) {
  const exit = existsSync(`${dir}/${pkg}.exit`) ? Number(readText(`${dir}/${pkg}.exit`).trim()) : null;
  const tests = readJson(`${dir}/${pkg}-tests.json`);
  const cov = readJson(`${dir}/${pkg}-coverage-summary.json`)?.total ?? null;
  return {
    exit,
    passed: tests?.numPassedTests ?? null,
    failed: tests?.numFailedTests ?? null,
    total: tests?.numTotalTests ?? null,
    coverage: cov ? Object.fromEntries(METRICS.map((m) => [m, cov[m].pct])) : null,
    log: readText(`${dir}/${pkg}.log`),
  };
}

function loadAll(resultsDir) {
  const before = Object.fromEntries(PACKAGES.map((p) => [p, load(`${resultsDir}/before`, p)]));
  const afterDir = existsSync(`${resultsDir}/after`) ? `${resultsDir}/after` : null;
  const after = Object.fromEntries(PACKAGES.map((p) => [p, afterDir ? load(afterDir, p) : before[p]]));
  return { before, after, reran: Boolean(afterDir) };
}

function evaluate(resultsDir, guardFile, decisionFile) {
  const guard = readJson(guardFile) ?? { ok: false, empty: true, files: [], errors: ['guard result missing'] };
  const { before, after } = loadAll(resultsDir);
  const reasons = [];
  if (process.env.AGENT_RESULT && process.env.AGENT_RESULT !== 'success') reasons.push('the agent job did not complete successfully');
  if (!guard.ok) reasons.push('the agent patch was rejected by the safety guard');
  for (const pkg of PACKAGES) {
    const b = before[pkg], a = after[pkg];
    if (a.exit !== 0) reasons.push(`${pkg} tests are failing`);
    if (a.coverage && b.coverage) {
      for (const m of ['lines', 'branches']) {
        if (a.coverage[m] + 0.005 < b.coverage[m]) reasons.push(`${pkg} ${m} coverage decreased`);
      }
    }
    if (a.total !== null && b.total !== null && a.total < b.total) reasons.push(`${pkg} has fewer tests than before`);
  }
  const verified = reasons.length === 0;
  const decision = { verified, shouldPush: verified && guard.ok && !guard.empty, reasons };
  writeFileSync(decisionFile, JSON.stringify(decision, null, 2));
  console.log(JSON.stringify(decision));
}

// --- sanitising untrusted text -------------------------------------------------------------
function neutralise(text, max) {
  return text
    .slice(0, max)
    .replace(/<!--/g, '&lt;!--')
    .replace(/</g, '&lt;')
    .replace(/!\[/g, '!\\[')
    .replace(/@/g, '@​');
}
function codeBlock(text, max) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/```/g, "'''").slice(-max);
  return '```text\n' + clean + '\n```';
}
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)}%`);
const delta = (b, a) => (b == null || a == null ? '' : ` (${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)})`);
const cell = (s) => String(s).replace(/\|/g, '\\|');

function render(resultsDir, guardFile, decisionFile, agentReportFile, commentFile) {
  const guard = readJson(guardFile) ?? { ok: false, empty: true, files: [], errors: ['guard result missing'] };
  const decision = readJson(decisionFile) ?? { verified: false, shouldPush: false, reasons: ['the workflow failed before reaching a verdict'] };
  const { before, after, reran } = loadAll(resultsDir);
  const env = process.env;
  const agentOk = env.AGENT_RESULT === 'success';

  let headline;
  if (!decision.verified) headline = 'Not verified';
  else if (guard.empty) headline = 'No test changes needed';
  else if (env.PUSH_RESULT === 'pushed') headline = 'Tests added and verified';
  else headline = 'Tests verified, not committed';

  const out = [MARKER, `## PR test agent: ${headline}`, ''];
  if (!decision.verified) out.push(`**Why:** ${decision.reasons.map((r) => cell(r)).join('; ')}.`, '');
  if (!agentOk) out.push(`> The agent job ended with status \`${cell(env.AGENT_RESULT ?? 'unknown')}\`. Any partial output was still checked below.`, '');

  if (!guard.empty) {
    if (guard.ok) {
      out.push(`**Agent changes** (${guard.files.length} files, +${guard.added}/-${guard.removed}):`);
      for (const f of guard.files) out.push(`- \`${f}\``);
    } else {
      out.push('**Agent patch rejected** by the safety guard:');
      for (const e of guard.errors.slice(0, 10)) out.push(`- ${neutralise(e, 200)}`);
    }
    out.push('');
  }

  const push = { pushed: `Committed to this branch as \`${(env.PUSHED_SHA ?? '').slice(0, 7)}\`.`,
    'branch-moved': 'Not committed: the branch changed while the agent ran. Push again to re-run.',
    'push-failed': 'Not committed: pushing to the branch failed (check branch protection).',
    'not-applicable': guard.empty ? '' : 'Not committed: verification did not pass.' }[env.PUSH_RESULT ?? 'not-applicable'];
  if (push) out.push(push, '');

  out.push('### Independent verification', '',
    reran ? 'Tests re-run by the workflow after applying the validated patch (not the agent\'s own claims).'
          : 'No test changes were applied; the figures are the current state of the branch.', '',
    '| Package | Tests before | Tests after | Statements | Branches | Functions | Lines |',
    '|---|---|---|---|---|---|---|');
  for (const pkg of PACKAGES) {
    const b = before[pkg], a = after[pkg];
    const t = (x) => (x.total === null ? 'n/a' : `${x.passed}/${x.total} passed`);
    const c = (m) => `${pct(b.coverage?.[m])} → ${pct(a.coverage?.[m])}${delta(b.coverage?.[m], a.coverage?.[m])}`;
    out.push(`| ${pkg} | ${t(b)} | ${t(a)}${a.exit === 0 ? '' : ' ❌'} | ${c('statements')} | ${c('branches')} | ${c('functions')} | ${c('lines')} |`);
  }
  out.push('');

  for (const pkg of PACKAGES) {
    if (after[pkg].exit !== 0 && after[pkg].log) {
      out.push(`<details><summary>${pkg} test output (failing)</summary>`, '', codeBlock(after[pkg].log, 4000), '', '</details>', '');
    }
  }

  const report = readText(agentReportFile);
  out.push('<details><summary>Agent report (model-written, treat as untrusted)</summary>', '',
    report ? neutralise(report, 6000) : '_The agent did not write a report._', '', '</details>', '');
  out.push(`<sub>Run: ${env.RUN_URL ?? ''} · commit \`${(env.HEAD_SHA ?? '').slice(0, 7)}\`</sub>`);

  const body = out.join('\n');
  writeFileSync(commentFile, body);
  if (env.GITHUB_STEP_SUMMARY) writeFileSync(env.GITHUB_STEP_SUMMARY, body, { flag: 'a' });
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'evaluate') evaluate(...args);
else if (cmd === 'render') render(...args);
else { console.error('usage: report.mjs evaluate|render ...'); process.exit(2); }
