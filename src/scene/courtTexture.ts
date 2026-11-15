import * as THREE from "three";

// Our own court design, painted onto a canvas: maple planks, regulation half-court lines, team-tinted paint.
// The canvas covers x from -25 to 25 ft and z from the baseline (-4.75) to 5 ft past midcourt.
export const COURT_W = 50, COURT_L = 52, BASE_Z = -4.75;

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeCourtTexture(paint: string, maxSize: number) {
  const S = Math.min(72, Math.floor(maxSize / COURT_L));
  const W = COURT_W * S, H = COURT_L * S;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!, rnd = mulberry(7);
  const X = (ft: number) => (ft + 25) * S, Z = (ft: number) => (ft - BASE_Z) * S;
  const plank = S * 0.21;

  for (let x = 0; x < W; x += plank) {
    let y = -rnd() * S * 5;
    while (y < H) {
      const len = S * (3.5 + rnd() * 5), v = rnd();
      g.fillStyle = `rgb(${Math.round(196 + v * 24)},${Math.round(150 + v * 22)},${Math.round(92 + v * 18)})`;
      g.fillRect(x, y, plank - 0.6, len - 1);
      y += len;
    }
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(84,50,18,.05)" : "rgba(255,236,200,.05)";
    g.fillRect(rnd() * W, rnd() * H, 1.2, S * (0.6 + rnd() * 3));
  }

  const col = new THREE.Color(paint).multiplyScalar(0.62);
  const fill = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},.94)`;
  g.fillStyle = fill;
  g.fillRect(X(-8), Z(-4.75), 16 * S, 19 * S);
  g.beginPath(); g.arc(X(0), Z(42.25), 6 * S, 0, Math.PI * 2); g.fill();

  g.strokeStyle = "#f7f4ec"; g.lineWidth = S / 6; g.lineJoin = "round";
  const th0 = Math.acos(22 / 23.75);
  const lw = g.lineWidth;
  g.beginPath(); g.moveTo(lw / 2, H); g.lineTo(lw / 2, lw / 2); g.lineTo(W - lw / 2, lw / 2); g.lineTo(W - lw / 2, H); g.stroke(); // sidelines and baseline
  g.beginPath(); g.moveTo(0, Z(42.25)); g.lineTo(W, Z(42.25)); g.stroke();
  g.strokeRect(X(-8), Z(-4.75), 16 * S, 19 * S);
  g.strokeRect(X(-6), Z(-4.75), 12 * S, 19 * S);
  g.beginPath(); g.arc(X(0), Z(14.25), 6 * S, 0, Math.PI); g.stroke();
  g.save(); g.setLineDash([S * 0.55, S * 0.55]); g.beginPath(); g.arc(X(0), Z(14.25), 6 * S, Math.PI, 2 * Math.PI); g.stroke(); g.restore();
  g.beginPath(); g.moveTo(X(-4), Z(-1.25)); g.lineTo(X(-4), Z(0)); g.arc(X(0), Z(0), 4 * S, Math.PI, 0, true); g.lineTo(X(4), Z(-1.25)); g.stroke();
  g.beginPath(); g.moveTo(X(22), Z(-4.75)); g.lineTo(X(22), Z(8.94)); g.arc(X(0), Z(0), 23.75 * S, th0, Math.PI - th0); g.lineTo(X(-22), Z(-4.75)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(42.25), 6 * S, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(X(0), Z(42.25), 2 * S, 0, Math.PI * 2); g.stroke();
  // lane hash marks
  for (const side of [-1, 1]) for (const z of [2.25, 3.25, 6.25, 9.25]) { g.beginPath(); g.moveTo(X(side * 8), Z(z)); g.lineTo(X(side * 8.7), Z(z)); g.stroke(); }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
