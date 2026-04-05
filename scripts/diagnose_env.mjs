#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const REPORTS_DIR = path.join(ROOT, 'reports');
const DIAG_DIR = path.join(REPORTS_DIR, 'env_diagnostics');
const WORKSPACE_ROOT = path.resolve(ROOT, '..', '..');
const MANUAL_QUEUE_PATH =
  process.env.X402BENCH_MANUAL_QUEUE_PATH
  || path.join(WORKSPACE_ROOT, 'runtime', 'manual_input_requests.md');

function nowIso() {
  return new Date().toISOString();
}

function nowStamp() {
  return nowIso().replace(/[:.]/g, '-');
}

function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvMerged() {
  let fileEnv = {};
  if (fs.existsSync(ENV_PATH)) {
    fileEnv = parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  }
  return { ...fileEnv, ...process.env };
}

function nonEmpty(value) {
  return String(value || '').trim().length > 0;
}

function masked(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

async function postJson(url, body, token = '') {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, body: text.slice(0, 400) };
}

function queueManualRequests(lines) {
  if (!lines.length) return;
  fs.mkdirSync(path.dirname(MANUAL_QUEUE_PATH), { recursive: true });
  if (!fs.existsSync(MANUAL_QUEUE_PATH)) {
    fs.writeFileSync(
      MANUAL_QUEUE_PATH,
      '# Manual Input Queue\n\nCollected automatically during unattended runs.\n\n',
      'utf8',
    );
  }
  const existing = fs.readFileSync(MANUAL_QUEUE_PATH, 'utf8');
  let append = '';
  for (const line of lines) {
    if (existing.includes(line)) continue;
    append += `- [ ] ${line} _(first seen: ${nowIso()})_\n`;
  }
  if (append) fs.appendFileSync(MANUAL_QUEUE_PATH, append, 'utf8');
}

function checkCliBinary(command) {
  const cmd = String(command || '').trim();
  if (!cmd) return { ok: false, detail: 'empty command' };
  const result = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    return { ok: false, detail: detail || `exit status ${result.status}` };
  }
  const version = String(result.stdout || result.stderr || '').trim().split(/\r?\n/, 1)[0];
  return { ok: true, detail: version || 'available' };
}

async function main() {
  const env = loadEnvMerged();

  const hederaMode = String(env.HEDERA_MODE || 'relay').toLowerCase();
  const chainlinkMode = String(env.CHAINLINK_MODE || 'webhook').toLowerCase();
  const ledgerMode = String(env.LEDGER_MODE || 'external_approver').toLowerCase();

  const required = [];
  required.push({ key: 'HEDERA_MODE', reason: 'Hedera adapter mode selector' });
  required.push({ key: 'HEDERA_NETWORK', reason: 'Hedera network target (testnet/previewnet/mainnet)' });

  if (hederaMode === 'sdk') {
    required.push({ key: 'HEDERA_OPERATOR_ID', reason: 'Hedera SDK payer account id' });
    required.push({ key: 'HEDERA_OPERATOR_KEY', reason: 'Hedera SDK private key (DER or ECDSA raw string)' });
  } else {
    required.push({ key: 'HEDERA_RELAY_URL', reason: 'Relay endpoint for Hedera relay mode' });
  }

  if (chainlinkMode === 'webhook') {
    required.push({ key: 'CHAINLINK_WEBHOOK_URL', reason: 'Chainlink workflow webhook endpoint' });
  } else {
    required.push({ key: 'CHAINLINK_CLI_PATH', reason: 'Chainlink CLI binary path for cli mode' });
    required.push({ key: 'CHAINLINK_CRE_ACTION', reason: 'CRE action: simulate or deploy' });
  }

  if (ledgerMode === 'external_approver') {
    required.push({ key: 'LEDGER_APPROVER_URL', reason: 'Ledger policy approver endpoint' });
  }

  required.push({ key: 'SERVICE_PROBE_URL', reason: 'Service probe endpoint for post-settlement verification' });

  const requiredStatus = required.map((item) => ({
    ...item,
    present: nonEmpty(env[item.key]),
    sample: item.key.toLowerCase().includes('key') || item.key.toLowerCase().includes('token')
      ? masked(env[item.key])
      : String(env[item.key] || ''),
  }));

  const missingRequired = requiredStatus.filter((item) => !item.present);

  const endpointChecks = [];

  if (nonEmpty(env.CHAINLINK_WEBHOOK_URL)) {
    try {
      const res = await postJson(
        env.CHAINLINK_WEBHOOK_URL,
        { runId: 'env-diagnose', scenarioId: 'ping', workflowInput: { probe: true } },
        env.CHAINLINK_WEBHOOK_TOKEN || '',
      );
      endpointChecks.push({ name: 'chainlink_webhook', url: env.CHAINLINK_WEBHOOK_URL, ...res });
    } catch (error) {
      endpointChecks.push({ name: 'chainlink_webhook', url: env.CHAINLINK_WEBHOOK_URL, ok: false, status: null, body: String(error?.message || error) });
    }
  }

  if (chainlinkMode === 'cli') {
    const cliPath = env.CHAINLINK_CLI_PATH || 'cre';
    const cliCheck = checkCliBinary(cliPath);
    endpointChecks.push({
      name: 'chainlink_cre_cli',
      url: cliPath,
      ok: cliCheck.ok,
      status: cliCheck.ok ? 0 : null,
      body: cliCheck.detail,
    });

    const action = String(env.CHAINLINK_CRE_ACTION || 'simulate').toLowerCase().trim();
    if (!['simulate', 'deploy'].includes(action)) {
      endpointChecks.push({
        name: 'chainlink_cre_action',
        url: action,
        ok: false,
        status: null,
        body: 'CHAINLINK_CRE_ACTION must be simulate or deploy',
      });
    }
  }

  if (nonEmpty(env.LEDGER_APPROVER_URL)) {
    try {
      const res = await postJson(
        env.LEDGER_APPROVER_URL,
        { runId: 'env-diagnose', scenarioId: 'ping', amountUsd: 1, challenge: 'env-diagnose' },
        env.LEDGER_APPROVER_TOKEN || '',
      );
      endpointChecks.push({ name: 'ledger_approver', url: env.LEDGER_APPROVER_URL, ...res });
    } catch (error) {
      endpointChecks.push({ name: 'ledger_approver', url: env.LEDGER_APPROVER_URL, ok: false, status: null, body: String(error?.message || error) });
    }
  }

  if (nonEmpty(env.SERVICE_PROBE_URL)) {
    try {
      const res = await postJson(
        env.SERVICE_PROBE_URL,
        { runId: 'env-diagnose', scenarioId: 'ping', txHash: '0xenv', workflowId: 'wf-env' },
        env.SERVICE_PROBE_TOKEN || '',
      );
      endpointChecks.push({ name: 'service_probe', url: env.SERVICE_PROBE_URL, ...res });
    } catch (error) {
      endpointChecks.push({ name: 'service_probe', url: env.SERVICE_PROBE_URL, ok: false, status: null, body: String(error?.message || error) });
    }
  }

  const manualActions = [];

  for (const item of missingRequired) {
    manualActions.push(`Set ${item.key} in .env (${item.reason}).`);
  }

  for (const check of endpointChecks) {
    if (check.ok) continue;
    manualActions.push(`Fix ${check.name} endpoint ${check.url} (status=${check.status || 'ERR'}).`);
  }

  if (!nonEmpty(env.HF_TOKEN) && !nonEmpty(env.OPENAI_API_KEY)) {
    manualActions.push('If you want hosted runtime runs, set HF_TOKEN or OPENAI_API_KEY.');
  }

  const result = {
    generatedAt: nowIso(),
    modes: { hederaMode, chainlinkMode, ledgerMode },
    requiredStatus,
    missingRequiredCount: missingRequired.length,
    endpointChecks,
    manualActions,
  };

  fs.mkdirSync(DIAG_DIR, { recursive: true });
  const stampedPath = path.join(DIAG_DIR, `env-diagnose-${nowStamp()}.json`);
  const latestPath = path.join(DIAG_DIR, 'latest.json');
  fs.writeFileSync(stampedPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  queueManualRequests(manualActions);

  process.stdout.write(`${JSON.stringify({ ok: missingRequired.length === 0, stampedPath, latestPath, manualQueuePath: MANUAL_QUEUE_PATH, missingRequired: missingRequired.map((x) => x.key), endpointFailures: endpointChecks.filter((x) => !x.ok).length })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exit(1);
});
