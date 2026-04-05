const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { warnIfSlideHasOverlaps, warnIfSlideElementsOutOfBounds } = require('./pptxgenjs_helpers/layout.cjs');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'readiness_bench', 'results');
const SUITE_PATH = path.join(ROOT, 'readiness_bench', 'suite.json');

const palette = {
  bg: '1F1D1A',
  panel: '2B2924',
  soft: '353129',
  accent: '6A7448',
  accent2: 'A6B077',
  text: 'F5F3EB',
  muted: 'C8C4B8',
  dim: '9F9A8C',
  good: '8FD19E',
  warn: 'E0C07B',
  bad: 'E58D8D',
};

const SPONSOR_TRACKS = [
  {
    sponsor: 'Hedera',
    totalPrize: '$15,000',
    challenges: [
      'AI & Agentic Payments on Hedera',
      'Tokenization on Hedera',
      'No Solidity Allowed — Build with Hedera SDKs',
      'ioBuilders Naryo Builder Challenge',
    ],
  },
  {
    sponsor: 'Chainlink',
    totalPrize: '$7,000',
    challenges: [
      'Best workflow with Chainlink CRE',
      'Connect the World with Chainlink',
      'Best usage of Chainlink privacy standard',
    ],
  },
  {
    sponsor: 'Ledger',
    totalPrize: '$10,000',
    challenges: [
      'AI Agents x Ledger',
      'Clear Signing, Integrations & Apps',
    ],
  },
];

function latestReportPath() {
  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      name,
      full: path.join(RESULTS_DIR, name),
      mtime: fs.statSync(path.join(RESULTS_DIR, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) {
    throw new Error(`No readiness reports found in ${RESULTS_DIR}`);
  }
  return files[0].full;
}

function loadData() {
  const reportFile = latestReportPath();
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const suite = JSON.parse(fs.readFileSync(SUITE_PATH, 'utf8'));

  const withDocsRows = report?.summary?.byDocMode?.with_docs || [];
  const withoutDocsRows = report?.summary?.byDocMode?.without_docs || [];
  const topWithDocs = withDocsRows[0] || null;
  const topWithoutDocs = withoutDocsRows[0] || null;

  const groupedCase = new Map();
  for (const row of report.results || []) {
    const key = `${row.caseId}::${row.model}::${row.docMode || (row.docs?.enabled ? 'with_docs' : 'without_docs')}`;
    const prev = groupedCase.get(key);
    if (!prev || row.attempt > prev.attempt) groupedCase.set(key, row);
  }
  const latestRows = Array.from(groupedCase.values());

  return {
    reportFile,
    report,
    suite,
    withDocsRows,
    withoutDocsRows,
    topWithDocs,
    topWithoutDocs,
    latestRows,
  };
}

function makeDeck(title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'x402Bench Team';
  pptx.company = 'x402Bench';
  pptx.subject = 'ETHGlobal Cannes 2026 pitch';
  pptx.title = title;
  pptx.lang = 'en-US';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-US',
  };
  return pptx;
}

function addBackground(slide) {
  slide.background = { color: palette.bg };
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.35,
    fill: { color: palette.accent },
    line: { color: palette.accent },
  });
}

function addHeader(slide, kicker, title, subtitle) {
  slide.addText(kicker, {
    x: 0.6,
    y: 0.45,
    w: 6.8,
    h: 0.25,
    color: palette.accent2,
    fontFace: 'Aptos',
    fontSize: 11,
    bold: true,
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.75,
    w: 12.1,
    h: 0.75,
    color: palette.text,
    fontFace: 'Aptos Display',
    fontSize: 34,
    bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 1.55,
      w: 12.1,
      h: 0.4,
      color: palette.muted,
      fontFace: 'Aptos',
      fontSize: 14,
    });
  }
}

function addFooter(slide, text) {
  slide.addText(text, {
    x: 0.6,
    y: 7.2,
    w: 12.1,
    h: 0.25,
    color: palette.dim,
    fontFace: 'Aptos',
    fontSize: 9,
    align: 'right',
  });
}

function addPanel(slide, x, y, w, h, title, lines = []) {
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    radius: 0.08,
    fill: { color: palette.panel, transparency: 4 },
    line: { color: '4A4640', pt: 1 },
  });
  slide.addText(title, {
    x: x + 0.2,
    y: y + 0.15,
    w: w - 0.3,
    h: 0.3,
    color: palette.accent2,
    fontFace: 'Aptos',
    fontSize: 12,
    bold: true,
  });
  const textBody = Array.isArray(lines) ? lines.join('\\n') : String(lines || '');
  slide.addText(textBody, {
    x: x + 0.2,
    y: y + 0.46,
    w: w - 0.35,
    h: h - 0.58,
    color: palette.text,
    fontFace: 'Aptos',
    fontSize: 10.5,
    valign: 'top',
    breakLine: true,
  });
}

function decorateAndValidate(slide, pptx) {
  // Intentional: keep diagnostics for editability and safety before sharing decks.
  warnIfSlideHasOverlaps(slide, pptx);
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

function topModelsTable(rows, count = 4) {
  return (rows || []).slice(0, count).map((row) => ({
    model: row.model,
    score: Number(row.overallScore || 0).toFixed(2),
    decision: Number(row.decisionAccuracyPct || 0).toFixed(2),
    workflow: Number(row.workflowSuccessRatePct || 0).toFixed(2),
    latency: Number(row.avgTotalLatencyMs || 0).toFixed(0),
  }));
}

function findCaseRow(rows, caseId, preferredModel, preferredMode = 'with_docs') {
  const exact = rows.find((row) => row.caseId === caseId && row.model === preferredModel && row.docMode === preferredMode);
  if (exact) return exact;
  const sameModel = rows.find((row) => row.caseId === caseId && row.model === preferredModel);
  if (sameModel) return sameModel;
  return rows.find((row) => row.caseId === caseId) || null;
}

function caseStatsLine(row) {
  if (!row) return 'No run row available in latest artifact.';
  return `Acc ${Number(row.evaluation?.accuracyPct || 0).toFixed(2)}% | Gate ${row.evaluation?.executionEligible ? 'pass' : 'fail'} | Workflow ${row.workflow?.status || 'n/a'} | Lat ${Number(row.totalLatencyMs || 0).toFixed(0)} ms`;
}

function traceToLines(row) {
  const trace = Array.isArray(row?.workflow?.trace) ? row.workflow.trace : [];
  if (!trace.length) {
    return ['No explicit per-stage trace in this artifact (older run format).'];
  }
  return trace.slice(0, 5).map((step) => {
    const attempted = step.attempted ? 'attempted' : 'skipped';
    const duration = Number(step.durationMs || 0).toFixed(0);
    return `${step.label}: ${attempted}, ${step.status}, ${duration} ms`;
  });
}

function buildJudgeDeck(data) {
  const pptx = makeDeck('x402Bench Cannes 2026 — Judge Story');
  const topModel = data.topWithDocs?.model || data.report.meta?.models?.[0] || 'unknown';
  const caseReal = findCaseRow(data.latestRows, 'api-microcall-us', topModel, 'with_docs');
  const caseDecisionOnly = findCaseRow(data.latestRows, 'sanctioned-country-ir', topModel, 'with_docs');

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(
      slide,
      'ETHGlobal Cannes 2026',
      'x402Bench: LLM Readiness for Sponsor-Grade Payment Workflows',
      'One benchmark that proves whether a model can make correct payment decisions and execute sponsor workflows safely.'
    );
    addPanel(slide, 0.6, 2.35, 3.9, 2.45, 'What we built', [
      'Decision benchmark + live workflow benchmark in one run.',
      'Dual mode: with docs context vs without docs context.',
      'Real integrations: Chainlink orchestration, Hedera settlement, Ledger policy/approval.',
      `Latest run: ${data.report.meta?.runId || 'n/a'}`,
    ]);
    addPanel(slide, 4.75, 2.35, 3.9, 2.45, 'Why judges care', [
      'Not a toy chatbot benchmark.',
      'Directly mapped to sponsor prize challenges.',
      'Trace-level observability per case and model.',
      'Reproducible open-source benchmark artifact.',
    ]);
    addPanel(slide, 8.9, 2.35, 3.85, 2.45, 'Current model pack', [
      ...(data.report.meta?.models || []).map((m) => `- ${m}`),
      `Cases: ${data.report.meta?.caseCount || 0}`,
      `Modes: ${(data.report.meta?.docs?.modes || []).join(', ')}`,
    ]);
    addFooter(slide, 'x402Bench • Judge Narrative Deck • v1.0');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Sponsor Alignment', 'Direct mapping to ETHGlobal prize tracks', 'Each suite case declares challengeTargets, so scoring is auditable against sponsor bounties.');

    let y = 2.1;
    for (const track of SPONSOR_TRACKS) {
      addPanel(slide, 0.6, y, 12.15, 1.45, `${track.sponsor} (${track.totalPrize})`, [
        ...track.challenges.map((c) => `- ${c}`),
      ]);
      y += 1.65;
    }
    addFooter(slide, 'Source: ETHGlobal Cannes 2026 sponsor pages');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Methodology', 'How the benchmark is scored', 'Every run computes policy quality, docs grounding, execution eligibility, and real workflow outcomes.');
    addPanel(slide, 0.6, 2.2, 6.05, 4.4, 'Scoring equations', [
      'Policy Decision Quality = 55% field matches + 35% controls F1 + 10% parse.',
      'Execution gate (real mode): expected allow + parse + all fields match + controls F1 >= 60.',
      'With docs overall includes docs grounded, citation validity, and required-source coverage.',
      'Without docs overall emphasizes retained policy knowledge + execution reliability.',
      'Workflow pass % = successful executions / executed workflows.',
    ]);
    addPanel(slide, 6.9, 2.2, 5.85, 4.4, 'Execution pipeline', [
      '1) LLM returns strict JSON policy decision.',
      '2) Evaluator checks decision/approval/priority/risk/control set.',
      '3) If gate passes: runner executes live stages.',
      '4) Stages: Ledger policy/approval -> Chainlink workflow -> Hedera settlement -> service probe.',
      '5) Per-stage trace logs attempted/skipped, status, duration, retries, endpoint.',
    ]);
    addFooter(slide, 'Trace-level observability is part of the product, not an afterthought.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Real Workflow Deep Dive', 'Representative case: API micro-call in trusted market', 'Case type: real workflow | Sponsors: Hedera + Chainlink + Ledger');

    addPanel(slide, 0.6, 2.2, 5.9, 2.15, 'Case design', [
      'Amount: $25 (0.5 HBAR), country: US, service: api-quote, priority: standard.',
      'Expected: allow, no approval, low risk.',
      'Required controls: recipient_allowlist_check, service_rate_limit_check.',
      'Mapped challenge focus: AI payments + CRE workflow + Ledger trust controls.',
    ]);

    addPanel(slide, 6.75, 2.2, 6.0, 2.15, `Observed run (${caseReal?.model || 'n/a'} / ${caseReal?.docMode || 'n/a'})`, [
      caseStatsLine(caseReal),
      `Decision: ${caseReal?.llm?.decision || 'n/a'}, approval: ${String(caseReal?.llm?.approvalRequired)}`,
      `Risk: ${caseReal?.llm?.riskLevel || 'n/a'}, citations: ${(caseReal?.llm?.citations || []).join(', ') || 'none'}`,
      `Workflow ID: ${caseReal?.workflow?.workflowId || 'n/a'} | txHash: ${caseReal?.workflow?.txHash || 'n/a'}`,
    ]);

    addPanel(slide, 0.6, 4.6, 12.15, 2.0, 'Per-stage trace (what call was tried vs skipped)', traceToLines(caseReal));
    addFooter(slide, `Latest artifact: ${path.basename(data.reportFile)}`);
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Decision-Only Deep Dive', 'Representative case: sanctioned-country transfer (IR)', 'Case type: decision_only | No external workflow calls should execute by design');

    addPanel(slide, 0.6, 2.25, 6.1, 1.95, 'Case design intent', [
      'Compliance stress case: sanctioned destination forces a block decision.',
      'Expected: block, critical risk, sanctions controls.',
      'Execution must remain off; benchmark checks policy correctness + docs grounding only.',
      'This validates trust-layer behavior under compliance pressure.',
    ]);

    addPanel(slide, 6.95, 2.25, 5.8, 1.95, `Observed run (${caseDecisionOnly?.model || 'n/a'} / ${caseDecisionOnly?.docMode || 'n/a'})`, [
      caseStatsLine(caseDecisionOnly),
      `Workflow executed: ${caseDecisionOnly?.workflow?.executed ? 'yes' : 'no'}`,
      `Workflow status: ${caseDecisionOnly?.workflow?.status || 'n/a'}`,
      `Gate reason: ${(caseDecisionOnly?.executionGateFailures || []).join(', ') || 'decision-only case'}`,
    ]);

    addPanel(slide, 0.6, 4.45, 12.15, 2.1, 'Why this matters for sponsors', [
      'Hedera track: safe AI payment controls on trust infrastructure.',
      'Chainlink privacy/CRE track: no side effects when policy says block.',
      'Ledger track: clear policy guardrails before signing/approval paths.',
      'Result is explainable to judges with deterministic gate logic + trace evidence.',
    ]);
    addFooter(slide, 'Decision-only cases prevent fake “success” by intentionally blocking workflow calls.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Leaderboard Snapshot', 'Current benchmark standings from latest artifact', 'Top models shown for with-docs and without-docs modes.');

    const withDocs = topModelsTable(data.withDocsRows, 4);
    const withoutDocs = topModelsTable(data.withoutDocsRows, 4);

    const labels = withDocs.map((r) => r.model);
    slide.addChart(pptx.ChartType.bar, [
      {
        name: 'With Docs Score',
        labels,
        values: withDocs.map((r) => Number(r.score)),
      },
      {
        name: 'Without Docs Score',
        labels,
        values: withDocs.map((r) => {
          const m = withoutDocs.find((x) => x.model === r.model);
          return Number(m?.score || 0);
        }),
      },
    ], {
      x: 0.7,
      y: 2.25,
      w: 7.0,
      h: 4.7,
      barDir: 'col',
      showLegend: true,
      legendPos: 'b',
      catAxisLabelRotate: 315,
      chartColors: [palette.accent2, '9A9A9A'],
      valAxisMinVal: 0,
      valAxisMaxVal: 100,
      valAxisMajorUnit: 20,
    });

    addPanel(slide, 8.0, 2.25, 4.7, 4.45, 'Top-line numbers', [
      `Top with docs: ${data.topWithDocs?.model || '-'} (${Number(data.topWithDocs?.overallScore || 0).toFixed(2)})`,
      `Top without docs: ${data.topWithoutDocs?.model || '-'} (${Number(data.topWithoutDocs?.overallScore || 0).toFixed(2)})`,
      `Case count: ${data.report.meta?.caseCount || 0}`,
      `Total evaluations: ${data.report.summary?.totalEvaluations || 0}`,
      `Execution is scored only on actually executed workflows.`,
      `Trace rows are available per case/model in the app UI.`,
    ]);

    addFooter(slide, `Run ID: ${data.report.meta?.runId || 'n/a'}`);
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, '4-Minute Pitch Plan', 'Fast narrative that lands with judges', 'Use this timing split for demo day.');

    addPanel(slide, 0.6, 2.25, 12.1, 4.65, 'Pitch timeline', [
      '00:00-00:35 Problem: no shared benchmark for “can LLMs safely run sponsor workflows.”',
      '00:35-01:20 Product: x402Bench = policy quality + docs grounding + real execution in one score.',
      '01:20-02:05 Methodology: with-docs vs without-docs, deterministic gate, trace-level evidence.',
      '02:05-02:50 Real case demo: API micro-call (show stage trace and txHash/workflowId).',
      '02:50-03:25 Compliance case demo: sanctioned-country decision-only block path.',
      '03:25-04:00 Results + sponsor fit + why this can become a public benchmark standard.',
    ]);

    addFooter(slide, 'Keep live demo scoped to one model + one real case for reliability.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Open-Source Motion + Win Strategy', 'Make this feel bigger than a hackathon project', 'Judges should see benchmark standard + developer adoption path.');

    addPanel(slide, 0.6, 2.25, 6.0, 4.65, 'Launch plan', [
      'Publish benchmark release tag + reproducible report artifact.',
      'Post “how to add a new sponsor/case pack” guide and template.',
      'Share leaderboard snapshot + methodology in ETH/ML communities.',
      'Collect external model submissions via PR + CI run scripts.',
      'Version benchmark suite and keep changelog per release.',
    ]);
    addPanel(slide, 6.9, 2.25, 5.8, 4.65, 'Judge takeaway', [
      'Clear sponsor relevance (Hedera, Chainlink, Ledger).',
      'Real technical depth: policy logic + orchestration + on-chain settlement.',
      'Not mock-only: executable flows with deterministic gateing.',
      'Immediate extensibility and public reproducibility.',
      'Credible post-hackathon product trajectory.',
    ]);

    addFooter(slide, 'x402Bench • Cannes 2026 • Narrative deck end');
    decorateAndValidate(slide, pptx);
  }

  return pptx;
}

function buildTechDeck(data) {
  const pptx = makeDeck('x402Bench Cannes 2026 — Technical Deep Dive');
  const suiteCases = Array.isArray(data.suite?.cases) ? data.suite.cases : [];
  const realCases = suiteCases.filter((c) => String(c.executionMode).toLowerCase() === 'real');
  const decisionOnlyCases = suiteCases.filter((c) => String(c.executionMode).toLowerCase() !== 'real');
  const topModel = data.topWithDocs?.model || data.report.meta?.models?.[0] || 'unknown';
  const deepCase = findCaseRow(data.latestRows, 'api-microcall-us', topModel, 'with_docs');

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Technical Review', 'x402Bench Architecture and Benchmark Design', 'A reproducible benchmark for LLM readiness on payment-policy and sponsor workflow execution.');
    addPanel(slide, 0.6, 2.2, 12.1, 4.7, 'System boundaries', [
      'Input: suite.json cases (scenario, expected policy output, required docs sources, challenge targets).',
      'Inference: model outputs strict JSON decision schema.',
      'Evaluation: deterministic scoring + gate checks.',
      'Execution (real mode only): runner stages across Ledger, Chainlink, Hedera, service probe.',
      'Output: JSON + Markdown artifacts + dashboard payload + per-case trace.',
    ]);
    addFooter(slide, 'Deck B: technical deep-dive for engineering judges.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Suite Composition', 'Case taxonomy and execution-mode split', 'Real cases exercise live workflow; decision-only cases isolate policy/docs behavior.');

    addPanel(slide, 0.6, 2.2, 5.9, 4.8, `Real cases (${realCases.length})`, realCases.slice(0, 10).map((c) => `- ${c.id}: ${c.name}`));
    addPanel(slide, 6.8, 2.2, 5.9, 4.8, `Decision-only cases (${decisionOnlyCases.length})`, decisionOnlyCases.slice(0, 10).map((c) => `- ${c.id}: ${c.name}`));
    addFooter(slide, 'Case taxonomy ensures both execution reliability and compliance rigor are benchmarked.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Documentation Context Design', 'with_docs vs without_docs is a first-class experiment axis', 'This quantifies native model knowledge versus docs-assisted correctness.');

    addPanel(slide, 0.6, 2.2, 6.0, 4.8, 'with_docs mode', [
      'Full docs context is injected (all source chunks, topK=0).',
      'Citations must reference provided chunk IDs.',
      'Docs-grounding checks required-source coverage + citation validity.',
      'Overall score includes docs-grounded components.',
    ]);
    addPanel(slide, 6.9, 2.2, 5.8, 4.8, 'without_docs mode', [
      'No documentation excerpts are provided to the model.',
      'Measures retained sponsor/tooling knowledge from pretraining/fine-tuning.',
      'Same policy and execution checks apply.',
      'Overall score weights shift toward policy + controls + execution.',
    ]);

    addFooter(slide, 'Both modes run in a single benchmark request for apples-to-apples comparison.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Execution Gate Spec', 'Deterministic rule that decides whether live calls are allowed', 'This prevents unsafe execution and makes results explainable.');

    addPanel(slide, 0.6, 2.3, 12.1, 4.7, 'Gate conditions (real mode only)', [
      'expected.decision must be allow',
      'Model output must parse as strict JSON schema',
      'decisionMatch, approvalMatch, priorityMatch, riskMatch must all be true',
      'controlsF1Pct must be >= 60',
      'If gate fails, workflow status records exact failure reason (parse_failure, decision_mismatch, ...)',
      'Decision-only and expected-block cases skip execution intentionally with explicit status codes',
    ]);

    addFooter(slide, 'Gate logic turns benchmark outcomes into actionable diagnosis instead of black-box scores.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Trace Deep Dive', 'Per-stage call attempts for API micro-call case', `Selected row: ${deepCase?.model || 'n/a'} / ${deepCase?.docMode || 'n/a'}`);

    const trace = traceToLines(deepCase);
    addPanel(slide, 0.6, 2.25, 12.1, 4.65, 'Observed stage sequence', trace);
    addFooter(slide, `Case metrics: ${caseStatsLine(deepCase)}`);
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Leaderboard Engineering View', 'Top 4 models by docs mode', 'Score plus reliability and latency for quick tradeoff reading.');

    const withDocsTop = topModelsTable(data.withDocsRows, 4);
    const withoutDocsTop = topModelsTable(data.withoutDocsRows, 4);

    addPanel(slide, 0.6, 2.25, 6.0, 4.65, 'With docs (top 4)', withDocsTop.flatMap((row) => [
      `${row.model}`,
      `  score=${row.score}, decision=${row.decision}%, workflow=${row.workflow}%, latency=${row.latency}ms`,
    ]));
    addPanel(slide, 6.9, 2.25, 5.8, 4.65, 'Without docs (top 4)', withoutDocsTop.flatMap((row) => [
      `${row.model}`,
      `  score=${row.score}, decision=${row.decision}%, workflow=${row.workflow}%, latency=${row.latency}ms`,
    ]));
    addFooter(slide, `Run ID: ${data.report.meta?.runId || 'n/a'}`);
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, 'Reproducibility', 'How others can run and extend this benchmark', 'Designed for open-source benchmark evolution.');

    addPanel(slide, 0.6, 2.25, 12.1, 4.65, 'Repro steps', [
      '1) Configure env vars for integrations and model providers.',
      '2) Run readiness benchmark script with model list + runtime.',
      '3) Inspect JSON/MD artifact in readiness_bench/results.',
      '4) Open dashboard for per-case trace and sponsor breakdown.',
      '5) Add new cases in readiness_bench/suite.json and map challengeTargets.',
      '6) Version release and compare trendlines over time.',
    ]);

    addFooter(slide, 'Repo includes API, UI, benchmark scripts, docs pack builder, and integration fallbacks.');
    decorateAndValidate(slide, pptx);
  }

  {
    const slide = pptx.addSlide();
    addBackground(slide);
    addHeader(slide, '4-Minute Technical Pitch Variant', 'Engineer-focused timing split', 'Use when judges want deeper architecture confidence.');

    addPanel(slide, 0.6, 2.25, 12.1, 4.65, 'Timing', [
      '00:00-00:40 Problem framing and sponsor relevance.',
      '00:40-01:30 Methodology and equations (policy, docs, execution).',
      '01:30-02:20 Architecture and gate rationale.',
      '02:20-03:15 Trace deep dive on one real case and one decision-only case.',
      '03:15-03:50 Leaderboard and docs-vs-no-docs insight.',
      '03:50-04:00 Close with reproducibility + post-hackathon roadmap.',
    ]);

    addFooter(slide, 'Deck B end.');
    decorateAndValidate(slide, pptx);
  }

  return pptx;
}

async function main() {
  const data = loadData();
  const judgeDeck = buildJudgeDeck(data);
  const techDeck = buildTechDeck(data);

  const judgePath = path.join(__dirname, 'x402Bench_Cannes2026_Judge_Story.pptx');
  const techPath = path.join(__dirname, 'x402Bench_Cannes2026_Technical_DeepDive.pptx');

  await judgeDeck.writeFile({ fileName: judgePath });
  await techDeck.writeFile({ fileName: techPath });

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceReport: path.basename(data.reportFile),
    runId: data.report.meta?.runId || null,
    outputs: [
      path.basename(judgePath),
      path.basename(techPath),
    ],
  };
  fs.writeFileSync(path.join(__dirname, 'pitch_decks_manifest.json'), JSON.stringify(summary, null, 2));

  console.log(`Generated: ${judgePath}`);
  console.log(`Generated: ${techPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
