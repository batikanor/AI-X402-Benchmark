#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    sources: 'readiness_bench/docs_sources/default_sources.json',
    out: 'readiness_bench/docs_cache/default_docs_pack.json',
    chunkChars: 700,
    maxChunksPerSource: 30,
    timeoutMs: 20000,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);

    const [flag, inline] = arg.split('=', 2);
    const next = inline ?? argv[i + 1];
    const value = inline ?? (next && !next.startsWith('--') ? next : undefined);
    if (!inline && value !== undefined) i += 1;

    switch (flag) {
      case '--sources':
        if (!value) throw new Error('--sources requires a value');
        options.sources = value;
        break;
      case '--out':
        if (!value) throw new Error('--out requires a value');
        options.out = value;
        break;
      case '--chunk-chars':
        options.chunkChars = Number(value);
        break;
      case '--max-chunks-per-source':
        options.maxChunksPerSource = Number(value);
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(value);
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (!Number.isInteger(options.chunkChars) || options.chunkChars < 300 || options.chunkChars > 4000) {
    throw new Error('chunkChars must be an integer between 300 and 4000.');
  }
  if (!Number.isInteger(options.maxChunksPerSource) || options.maxChunksPerSource < 3 || options.maxChunksPerSource > 200) {
    throw new Error('maxChunksPerSource must be an integer between 3 and 200.');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 2000 || options.timeoutMs > 120000) {
    throw new Error('timeoutMs must be an integer between 2000 and 120000.');
  }

  return options;
}

function normalizeSourceId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|section|article|h1|h2|h3|h4|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

function chunkText(text, maxChars) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    if (`${current}\n\n${paragraph}`.length <= maxChars) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }
    chunks.push(current);
    current = paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const cwd = process.cwd();
  const sourcesPath = path.resolve(cwd, options.sources);
  const outputPath = path.resolve(cwd, options.out);

  if (!fs.existsSync(sourcesPath)) {
    throw new Error(`Sources file not found: ${sourcesPath}`);
  }

  const config = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const sources = Array.isArray(config.sources) ? config.sources : [];
  if (!sources.length) {
    throw new Error('Sources file must include a non-empty sources array.');
  }

  const outputSources = [];

  for (const source of sources) {
    const id = normalizeSourceId(source.id || source.title || source.url);
    const title = String(source.title || id);
    const url = String(source.url || '');
    if (!id || !url) continue;

    process.stdout.write(`Fetching ${title} (${url})\n`);
    let html = '';
    try {
      html = await fetchWithTimeout(url, options.timeoutMs);
    } catch (error) {
      process.stdout.write(`Skipped ${id}: ${error.message || String(error)}\n`);
      continue;
    }

    const text = htmlToText(html);
    const chunks = chunkText(text, options.chunkChars)
      .slice(0, options.maxChunksPerSource)
      .map((chunk) => ({ text: chunk }));

    if (!chunks.length) {
      process.stdout.write(`Skipped ${id}: no extractable text\n`);
      continue;
    }

    outputSources.push({
      id,
      title,
      url,
      fetchedAt: new Date().toISOString(),
      chunks,
    });
  }

  const pack = {
    name: config.name || 'x402Bench Official Documentation Pack',
    version: config.version || '1.0',
    generatedAt: new Date().toISOString(),
    sources: outputSources,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(pack, null, 2));

  process.stdout.write(`${JSON.stringify({
    outputPath,
    sourceCount: outputSources.length,
    totalChunks: outputSources.reduce((acc, item) => acc + item.chunks.length, 0),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
