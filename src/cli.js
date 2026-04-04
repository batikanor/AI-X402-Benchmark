#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "./utils/args.js";
import { loadEnv, getEnv } from "./utils/env.js";
import { Logger } from "./utils/logger.js";
import { readJson, writeJson, writeText, ensureDir } from "./utils/io.js";
import { validateConfig } from "./core/validateConfig.js";
import { BenchmarkRunner } from "./core/runner.js";
import { buildMarkdownReport } from "./core/report.js";

function usage() {
  process.stdout.write(
    [
      "x402Bench CLI",
      "",
      "Commands:",
      "  run --config <path> [--out <dir>] [--strict]",
      "  validate --config <path>",
      ""
    ].join("\n")
  );
}

async function commandValidate(configPath) {
  const config = readJson(configPath);
  const validation = validateConfig(config);
  if (!validation.ok) {
    for (const err of validation.errors) {
      process.stderr.write(`CONFIG_ERROR: ${err}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Config is valid.\n");
}

async function commandRun(configPath, outputDir, strict) {
  const config = readJson(configPath);
  const validation = validateConfig(config);

  if (!validation.ok) {
    for (const err of validation.errors) {
      process.stderr.write(`CONFIG_ERROR: ${err}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const logger = new Logger(getEnv("X402BENCH_LOG_LEVEL", "info"));
  const runner = new BenchmarkRunner(config, logger);

  const runResult = await runner.runSuite();

  const reportDir = path.resolve(outputDir);
  ensureDir(reportDir);

  const jsonPath = path.join(reportDir, `${runResult.metadata.runId}.json`);
  const mdPath = path.join(reportDir, `${runResult.metadata.runId}.md`);

  writeJson(jsonPath, runResult);
  writeText(mdPath, buildMarkdownReport(runResult));

  process.stdout.write(`Run completed: ${runResult.metadata.runId}\n`);
  process.stdout.write(`Overall score: ${runResult.scoring.overallScore}\n`);
  process.stdout.write(`JSON report: ${jsonPath}\n`);
  process.stdout.write(`Markdown report: ${mdPath}\n`);

  if (strict && runResult.scoring.overallScore < Number(config.suite.minPassingScore || 75)) {
    process.stderr.write(
      `Strict mode failed: overall score ${runResult.scoring.overallScore} is below minPassingScore ${config.suite.minPassingScore}.\n`
    );
    process.exitCode = 2;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnv(process.cwd());

  if (!args.command || !args.config) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.command === "validate") {
    await commandValidate(args.config);
    return;
  }

  if (args.command === "run") {
    await commandRun(args.config, args.outputDir, args.strict);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
