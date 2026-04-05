#!/usr/bin/env node

function parseArgs(argv) {
  const options = { url: 'http://127.0.0.1:46211' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.replace(/^--/, '').split('=');
    const next = inlineValue ?? argv[i + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : undefined);
    if (value === undefined) {
      throw new Error(`Missing value for --${key}`);
    }
    if (!inlineValue) {
      i += 1;
    }
    if (key === 'url') {
      options.url = value;
      continue;
    }
    throw new Error(`Unknown option: --${key}`);
  }
  return options;
}

function firstCssHrefFromHtml(html) {
  const matches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi)];
  for (const match of matches) {
    const href = match[1];
    if (href.includes('/_next/static/css/')) {
      return href;
    }
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(options.url);

  const landing = await fetchText(baseUrl);
  if (!landing.response.ok) {
    throw new Error(`Frontend page is not healthy: ${landing.response.status} ${landing.response.statusText}`);
  }

  const cssHref = firstCssHrefFromHtml(landing.text);
  if (!cssHref) {
    throw new Error('Frontend page is missing Next.js stylesheet link.');
  }

  const cssUrl = new URL(cssHref, baseUrl).toString();
  const css = await fetchText(cssUrl);
  if (!css.response.ok) {
    throw new Error(`Stylesheet is not healthy: ${css.response.status} ${css.response.statusText}`);
  }

  const contentType = css.response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/css')) {
    throw new Error(`Stylesheet content-type is invalid: ${contentType || 'missing'}`);
  }

  const hasTailwindSignals =
    css.text.includes('.rounded-2xl') ||
    css.text.includes('.bg-panel') ||
    css.text.includes('.data-table');
  if (!hasTailwindSignals) {
    throw new Error('Stylesheet loaded but expected dashboard classes were not found.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        frontendUrl: baseUrl.toString(),
        cssUrl,
        pageStatus: landing.response.status,
        cssStatus: css.response.status,
        cssContentType: contentType,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`Frontend health check failed: ${error.message}`);
  process.exitCode = 1;
});
