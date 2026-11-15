import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// A lights-down NBA-scale bowl, built from the reference photos: rows of empty seats that catch a little light,
// a glowing ribbon board above the lower bowl, bright fixture clusters in the rafters, and a center-hung scoreboard.

const ROWS = 18, ROW_DEPTH = 2.8, ROW_RISE = 1.5, SIDE_X = 34, END_Z = -15, SEAT_GAP = 1.9;
const TOP_Y = 1.2 + ROWS * ROW_RISE;

function textCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FONT = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';

function Seats() {
  const backs = useRef<THREE.InstancedMesh>(null!), cushions = useRef<THREE.InstancedMesh>(null!);
  const seats = useMemo(() => {
    const out: { x: number; y: number; z: number; rot: number; tone: number }[] = [];
    let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < ROWS; r++) {
      const y = 1.2 + r * ROW_RISE, off = r * ROW_DEPTH + ROW_DEPTH / 2;
      for (const side of [-1, 1]) {
        let i = 0;
        for (let z = END_Z - r * ROW_DEPTH; z < 96; z += SEAT_GAP, i++) {
          if (i % 16 === 8) continue; // aisle
          out.push({ x: side * (SIDE_X + off), y, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, tone: rnd() });
        }
      }
      const half = SIDE_X + r * ROW_DEPTH; let i = 0;
      for (let x = -half; x <= half; x += SEAT_GAP, i++) {
        if (i % 16 === 8) continue;
        out.push({ x, y, z: END_Z - off, rot: 0, tone: rnd() });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const d = new THREE.Object3D(), c = new THREE.Color();
    seats.forEach((s, i) => {
      const bx = -Math.sin(s.rot) * 0.55, bz = -Math.cos(s.rot) * 0.55; // backrest sits away from the court
      d.rotation.set(0, s.rot, 0);
      d.position.set(s.x + bx, s.y + 1.75, s.z + bz); d.updateMatrix(); backs.current.setMatrixAt(i, d.matrix);
      d.position.set(s.x, s.y + 0.95, s.z); d.updateMatrix(); cushions.current.setMatrixAt(i, d.matrix);
      c.setRGB(0.2 + s.tone * 0.07, 0.235 + s.tone * 0.07, 0.3 + s.tone * 0.08);
      backs.current.setColorAt(i, c); cushions.current.setColorAt(i, c);
    });
    [backs, cushions].forEach((m) => { m.current.instanceMatrix.needsUpdate = true; if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true; });
  }, [seats]);
  return (
    <>
      <instancedMesh ref={backs} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <boxGeometry args={[1.62, 1.55, 0.22]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={cushions} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <boxGeometry args={[1.62, 0.26, 1.2]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
    </>
  );
}

function Risers() {
  // The concrete steps the seats sit on, plus a plain dark upper bowl above the ribbon board.
  const rows = Array.from({ length: ROWS }, (_, r) => r);
  const upper = [0, 1, 2, 3, 4, 5];
  const mat = <meshStandardMaterial color="#0c0f18" roughness={1} />;
  const topX = SIDE_X + ROWS * ROW_DEPTH, topZ = END_Z - ROWS * ROW_DEPTH;
  return (
    <group>
      {rows.map((r) => {
        const h = 1.2 + r * ROW_RISE, x = SIDE_X + r * ROW_DEPTH + ROW_DEPTH / 2, z = END_Z - r * ROW_DEPTH - ROW_DEPTH / 2;
        return (
          <group key={r}>
            <mesh position={[-x, h / 2, 30]}>{<boxGeometry args={[ROW_DEPTH, h, 140]} />}{mat}</mesh>
            <mesh position={[x, h / 2, 30]}>{<boxGeometry args={[ROW_DEPTH, h, 140]} />}{mat}</mesh>
            <mesh position={[0, h / 2, z]}>{<boxGeometry args={[(SIDE_X + r * ROW_DEPTH) * 2, h, ROW_DEPTH]} />}{mat}</mesh>
          </group>
        );
      })}
      {upper.map((u) => {
        const h = TOP_Y + 7 + u * 4.2, x = topX + 6 + u * 5 + 2.5, z = topZ - 6 - u * 5 - 2.5;
        return (
          <group key={"u" + u}>
            <mesh position={[-x, h / 2, 30]}><boxGeometry args={[5, h, 150]} /><meshStandardMaterial color="#07090f" roughness={1} /></mesh>
            <mesh position={[x, h / 2, 30]}><boxGeometry args={[5, h, 150]} /><meshStandardMaterial color="#07090f" roughness={1} /></mesh>
            <mesh position={[0, h / 2, z]}><boxGeometry args={[x * 2, h, 5]} /><meshStandardMaterial color="#07090f" roughness={1} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

function Ribbon({ color, fontTick }: { color: string; fontTick: number }) {
  const tex = useMemo(() => {
    const t = textCanvas(2048, 128, (g) => {
      const c = new THREE.Color(color), deep = c.clone().multiplyScalar(0.55);
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, `#${c.getHexString()}`); grad.addColorStop(1, `#${deep.getHexString()}`);
      g.fillStyle = grad; g.fillRect(0, 0, 2048, 128);
      g.fillStyle = "rgba(255,255,255,.16)";
      for (let x = -128; x < 2048; x += 64) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 64, 0); g.lineTo(x + 86, 0); g.lineTo(x + 22, 128); g.fill(); }
      g.fillStyle = "#ffffff"; g.font = `italic 800 84px ${FONT}`; g.textBaseline = "middle";
      for (let x = 60; x < 2048; x += 1024) g.fillText("SHOT CHART STUDIO", x, 68);
    });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, [color, fontTick]);
  useEffect(() => () => tex.dispose(), [tex]);
  const side = useMemo(() => { const t = tex.clone(); t.repeat.set(5, 1); t.needsUpdate = true; return t; }, [tex]);
  const end = useMemo(() => { const t = tex.clone(); t.repeat.set(6, 1); t.needsUpdate = true; return t; }, [tex]);
  const x = SIDE_X + ROWS * ROW_DEPTH + 0.2, z = END_Z - ROWS * ROW_DEPTH - 0.2, y = TOP_Y + 3.2;
  return (
    <group>
      <mesh position={[-x, y, 30]} rotation-y={Math.PI / 2}><planeGeometry args={[150, 3.6]} /><meshBasicMaterial map={side} toneMapped={false} color="#b8b8b8" /></mesh>
      <mesh position={[x, y, 30]} rotation-y={-Math.PI / 2}><planeGeometry args={[150, 3.6]} /><meshBasicMaterial map={side} toneMapped={false} color="#b8b8b8" /></mesh>
      <mesh position={[0, y, z]}><planeGeometry args={[x * 2, 3.6]} /><meshBasicMaterial map={end} toneMapped={false} color="#b8b8b8" /></mesh>
    </group>
  );
}

function Rafters({ color, fontTick }: { color: string; fontTick: number }) {
  // Fixture clusters: each is a ring of hot lamps that blooms on camera and shows up as highlights in the floor.
  const lamps = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const cz of [-18, 14, 46, 78]) for (const cx of [-46, -16, 16, 46]) for (let k = 0; k < 5; k++) out.push([cx + (k - 2) * 2.6, 84, cz + ((k % 2) - 0.5) * 2.4]);
    return out;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const d = new THREE.Object3D(); d.rotation.set(Math.PI / 2, 0, 0);
    lamps.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); ref.current.setMatrixAt(i, d.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [lamps]);
  const screen = useMemo(() => textCanvas(512, 288, (g) => {
    const c = new THREE.Color(color).multiplyScalar(0.5);
    g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, 0, 512, 288);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `italic 800 86px ${FONT}`; g.fillText("SHOT CHART", 256, 108); g.fillText("STUDIO", 256, 190);
  }), [color, fontTick]);
  useEffect(() => () => screen.dispose(), [screen]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <circleGeometry args={[0.95, 16]} />
        <meshBasicMaterial color={[6, 5.6, 5]} toneMapped={false} />
      </instancedMesh>
      <group position={[0, 50, 42.25]}>
        <mesh><boxGeometry args={[21, 11.5, 21]} /><meshStandardMaterial color="#0a0c12" roughness={0.6} /></mesh>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} rotation-y={(k * Math.PI) / 2} position={[Math.sin((k * Math.PI) / 2) * 10.56, 0, Math.cos((k * Math.PI) / 2) * 10.56]}>
            <planeGeometry args={[19.4, 10]} /><meshBasicMaterial map={screen} toneMapped={false} color="#9a9a9a" />
          </mesh>
        ))}
        <mesh position={[0, -6.6, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[12, 0.45, 8, 48]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

export function Hoop({ color }: { color: string }) {
  const pad = useMemo(() => new THREE.Color(color).multiplyScalar(0.5), [color]);
  const clock = useMemo(() => textCanvas(256, 144, (g) => {
    g.fillStyle = "#05060a"; g.fillRect(0, 0, 256, 144);
    g.fillStyle = "#ff3b30"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 112px ${FONT}`; g.fillText("24", 128, 78);
  }), []);
  return (
    <group>
      <mesh position={[0, 10.75, -1.25]}>
        <boxGeometry args={[6, 3.5, 0.1]} />
        <meshPhysicalMaterial color="#dfe9ff" transparent opacity={0.14} roughness={0.05} />
      </mesh>
      <lineSegments position={[0, 10.75, -1.25]}><edgesGeometry args={[new THREE.BoxGeometry(6, 3.5, 0.1)]} /><lineBasicMaterial color="#e9eefc" /></lineSegments>
      <lineSegments position={[0, 10.75, -1.19]}><edgesGeometry args={[new THREE.BoxGeometry(2, 1.5, 0.01)]} /><lineBasicMaterial color="#e9eefc" /></lineSegments>
      <mesh position={[0, 8.93, -1.25]}><boxGeometry args={[6.1, 0.16, 0.22]} /><meshStandardMaterial color={pad} roughness={0.7} /></mesh>
      <mesh position={[0, 10, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.75, 0.055, 12, 48]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#b23200" emissiveIntensity={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, 9.32, 0]}><cylinderGeometry args={[0.75, 0.46, 1.36, 16, 5, true]} /><meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} /></mesh>
      <mesh position={[0, 9.9, -0.95]}><boxGeometry args={[0.5, 0.35, 0.6]} /><meshStandardMaterial color="#c2401a" roughness={0.5} /></mesh>
      {/* shot clock on top of the board */}
      <mesh position={[0, 13.5, -1.7]}><boxGeometry args={[2.5, 1.45, 0.7]} /><meshStandardMaterial color="#0a0c12" roughness={0.6} /></mesh>
      <mesh position={[0, 13.5, -1.34]}><planeGeometry args={[2.3, 1.28]} /><meshBasicMaterial map={clock} toneMapped={false} /></mesh>
      <mesh position={[0, 12.65, -1.7]}><boxGeometry args={[0.3, 0.4, 0.3]} /><meshStandardMaterial color="#0a0c12" /></mesh>
      {/* arm, padded post and base */}
      <mesh position={[0, 9.5, -4.5]} rotation-x={-0.18} castShadow><boxGeometry args={[0.8, 0.8, 6.6]} /><meshStandardMaterial color="#12151e" roughness={0.6} /></mesh>
      <mesh position={[0, 5.9, -5.6]} rotation-x={-0.62} castShadow><boxGeometry args={[0.5, 0.5, 6.4]} /><meshStandardMaterial color="#12151e" roughness={0.6} /></mesh>
      <mesh position={[0, 4.4, -8.1]} castShadow><boxGeometry args={[1.4, 8.8, 1.4]} /><meshStandardMaterial color="#12151e" roughness={0.7} /></mesh>
      <mesh position={[0, 3.3, -7.2]} rotation-x={0.12} castShadow><boxGeometry args={[2.3, 6.2, 0.9]} /><meshStandardMaterial color={pad} roughness={0.75} /></mesh>
      <mesh position={[0, 0.75, -8.6]} castShadow><boxGeometry args={[4.6, 1.5, 5]} /><meshStandardMaterial color={pad} roughness={0.75} /></mesh>
    </group>
  );
}

export function Arena({ color, fontTick }: { color: string; fontTick: number }) {
  return (
    <group>
      <Risers />
      <Seats />
      <Ribbon color={color} fontTick={fontTick} />
      <Rafters color={color} fontTick={fontTick} />
      {/* scorer's table along one sideline */}
      <mesh position={[30.6, 1.3, 40]}><boxGeometry args={[2.4, 2.6, 34]} /><meshStandardMaterial color="#0c0f18" roughness={0.7} /></mesh>
      <mesh position={[29.38, 1.3, 40]} rotation-y={-Math.PI / 2}><planeGeometry args={[34, 2.2]} /><meshBasicMaterial color={new THREE.Color(color).multiplyScalar(0.7)} toneMapped={false} /></mesh>
    </group>
  );
}
