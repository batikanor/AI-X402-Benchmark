const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

export class Logger {
  constructor(level = "info") {
    this.level = LEVELS[level] ?? LEVELS.info;
  }

  log(level, message, meta = null) {
    if ((LEVELS[level] ?? 99) > this.level) return;
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {})
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  error(message, meta) { this.log("error", message, meta); }
  warn(message, meta) { this.log("warn", message, meta); }
  info(message, meta) { this.log("info", message, meta); }
  debug(message, meta) { this.log("debug", message, meta); }
}
