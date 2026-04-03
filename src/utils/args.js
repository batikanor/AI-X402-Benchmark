export function parseArgs(argv) {
  const out = {
    command: null,
    config: null,
    strict: false,
    outputDir: "reports"
  };

  if (argv.length > 2) {
    out.command = argv[2];
  }

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      out.config = argv[i + 1];
      i += 1;
    } else if (arg === "--strict") {
      out.strict = true;
    } else if (arg === "--out") {
      out.outputDir = argv[i + 1];
      i += 1;
    }
  }

  return out;
}
