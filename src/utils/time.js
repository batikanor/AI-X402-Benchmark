export function nowIso() {
  return new Date().toISOString();
}

export function durationMs(startNs, endNs) {
  return Number(endNs - startNs) / 1_000_000;
}

export function msToFixed(ms) {
  return Number(ms.toFixed(2));
}
