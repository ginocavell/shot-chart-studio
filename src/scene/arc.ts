// The path a shot takes through the air, in feet. Hoop is at the origin, 10 ft up.
export const SEG = 22;

/** Height the ball leaves from, by move type. */
function releaseHeight(move: string) {
  return move === "dunk" ? 9.2 : move === "layup" || move === "hook" || move === "floater" ? 8.2 : 7.4;
}

export function arcPoint(x: number, y: number, made: number, move: string, idx: number, u: number, out: number[]) {
  const sx = x / 10, sz = y / 10, d = Math.hypot(sx, sz);
  const ang = idx * 2.399963; // misses glance off a different side of the rim each time
  const tx = made ? 0 : Math.cos(ang) * 0.9, tz = made ? 0 : Math.sin(ang) * 0.9;
  const h0 = releaseHeight(move);
  const lift = move === "dunk" ? 0.3 : move === "layup" ? 0.9 : 1.1 + d * 0.27;
  out[0] = sx + (tx - sx) * u;
  out[1] = h0 + (10.05 - h0) * u + 4 * lift * u * (1 - u);
  out[2] = sz + (tz - sz) * u;
  return out;
}
