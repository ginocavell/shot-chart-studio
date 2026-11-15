import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ShotFile } from "../data";
import { SEG, arcPoint } from "./arc";
import { BASE_Z, COURT_L, COURT_W, makeApronTexture, makeCourtTexture } from "./courtTexture";
import { Arena, Hoop } from "./Arena";

export type Replay = { shown: number; flying: number; u: number };
export type CamKey = "main" | "floor" | "sideline" | "baseline" | "overhead";

type Props = { shots: ShotFile | null; idx: number[]; moves: string[]; color: string; focus: boolean; replay: React.MutableRefObject<Replay>; cam: CamKey; camNonce: number; lite: boolean };

const CAMS: Record<CamKey, { p: [number, number, number]; t: [number, number, number] }> = {
  main: { p: [24, 19, 64], t: [0, 4.5, 9] },
  floor: { p: [0, 5.2, 61], t: [0, 9.5, 0] },
  sideline: { p: [64, 26, 24], t: [0, 2.5, 15] },
  baseline: { p: [17, 15, -25], t: [0, 3, 15] },
  overhead: { p: [0, 88, 19.5], t: [0, 0, 19] },
};

function Floor({ color, lite, fontTick }: { color: string; lite: boolean; fontTick: number }) {
  const gl = useThree((s) => s.gl);
  const tex = useMemo(() => makeCourtTexture(color, Math.min(4096, gl.capabilities.maxTextureSize)), [color, gl]);
  useEffect(() => () => tex.dispose(), [tex]);
  const apron = useMemo(() => makeApronTexture(color), [color, fontTick]);
  useEffect(() => () => apron.dispose(), [apron]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, BASE_Z + COURT_L / 2]} receiveShadow>
        <planeGeometry args={[COURT_W, COURT_L]} />
        {lite ? (
          <meshStandardMaterial map={tex} roughness={0.42} />
        ) : (
          <MeshReflectorMaterial map={tex} resolution={1024} mirror={0.7} mixBlur={5} mixStrength={0.85} blur={[260, 70]} roughness={0.5} metalness={0} depthScale={0} />
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 18.25]} receiveShadow>
        <planeGeometry args={[66, 66]} />
        <meshStandardMaterial map={apron} roughness={0.42} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.07, 30]}>
        <planeGeometry args={[70, 150]} />
        <meshStandardMaterial color="#10131c" roughness={0.6} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.1, 20]}>
        <planeGeometry args={[900, 900]} />
        <meshBasicMaterial color="#030407" />
      </mesh>
    </group>
  );
}

function Lights({ color, lite }: { color: string; lite: boolean }) {
  const key = useRef<THREE.SpotLight>(null!), l = useRef<THREE.SpotLight>(null!), r = useRef<THREE.SpotLight>(null!);
  useLayoutEffect(() => {
    key.current.target.position.set(0, 0, 17); l.current.target.position.set(0, 0, 12); r.current.target.position.set(0, 0, 12);
    [key, l, r].forEach((s) => s.current.target.updateMatrixWorld());
  }, []);
  return (
    <>
      <hemisphereLight args={["#b9c6f0", "#0a0806", 0.3]} />
      <spotLight ref={key} position={[0, 74, 24]} angle={0.52} penumbra={0.75} decay={0} intensity={2.35} color="#fff6ea"
        castShadow={!lite} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.04} />
      <spotLight ref={l} position={[-52, 34, 6]} angle={0.5} penumbra={1} decay={0} intensity={0.9} color={color} />
      <spotLight ref={r} position={[52, 34, 6]} angle={0.5} penumbra={1} decay={0} intensity={0.9} color={color} />
    </>
  );
}

/** Thick shot trails: one draw call for makes, one for misses, revealed in order during replay. */
function Trails({ shots, idx, moves, focus, replay, color }: Pick<Props, "shots" | "idx" | "moves" | "focus" | "replay" | "color">) {
  const size = useThree((s) => s.size);
  const built = useMemo(() => {
    if (!shots || !idx.length) return null;
    const n = idx.length, tmp = [0, 0, 0];
    const nMade = idx.reduce((a, i) => a + shots.m[i], 0);
    const I = focus ? 1 : Math.max(0.035, Math.min(0.5, 42 / n));
    const mk = { pos: new Float32Array(nMade * SEG * 6), col: new Float32Array(nMade * SEG * 6), o: 0 };
    const ms = { pos: new Float32Array((n - nMade) * SEG * 6), col: new Float32Array((n - nMade) * SEG * 6), o: 0 };
    const madeBefore = new Uint32Array(n + 1);
    const tint = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.72);
    idx.forEach((si, k) => {
      const made = shots.m[si], b = made ? mk : ms, move = moves[shots.a[si]];
      const base = made ? [tint.r, tint.g, tint.b] : [1, 0.2, 0.26];
      const gain = made ? I : focus ? I * 0.55 : 0; // in the season view misses stay as floor dots only
      for (let s = 0; s < SEG; s++) for (let e = 0; e < 2; e++) {
        const u = (s + e) / SEG; arcPoint(shots.x[si], shots.y[si], made, move, si, u, tmp);
        const f = gain * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
        b.pos[b.o] = tmp[0]; b.pos[b.o + 1] = tmp[1]; b.pos[b.o + 2] = tmp[2];
        b.col[b.o] = base[0] * f; b.col[b.o + 1] = base[1] * f; b.col[b.o + 2] = base[2] * f; b.o += 3;
      }
      madeBefore[k + 1] = madeBefore[k] + made;
    });
    const make = (d: typeof mk, width: number) => {
      const g = new LineSegmentsGeometry(); g.setPositions(d.pos); g.setColors(d.col);
      const m = new LineMaterial({ vertexColors: true, linewidth: width, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const line = new LineSegments2(g, m); line.frustumCulled = false; line.renderOrder = 2;
      return line;
    };
    return { makes: make(mk, focus ? 3.2 : 1.7), misses: make(ms, focus ? 2 : 1.1), madeBefore, n };
  }, [shots, idx, moves, focus, color]);

  useEffect(() => () => { if (built) [built.makes, built.misses].forEach((l) => { l.geometry.dispose(); (l.material as LineMaterial).dispose(); }); }, [built]);
  useEffect(() => { if (built) [built.makes, built.misses].forEach((l) => (l.material as LineMaterial).resolution.set(size.width, size.height)); }, [built, size]);
  useFrame(() => {
    if (!built) return;
    const k = Math.max(0, Math.min(built.n, Math.floor(replay.current.shown)));
    built.makes.geometry.instanceCount = built.madeBefore[k] * SEG;
    built.misses.geometry.instanceCount = (k - built.madeBefore[k]) * SEG;
  });
  if (!built) return null;
  return (<><primitive object={built.misses} /><primitive object={built.makes} /></>);
}

/** Floor markers, the way a telestrator would draw them: a ring where it went in, a small dot where it didn't. */
function Markers({ shots, idx, replay, color, focus }: Pick<Props, "shots" | "idx" | "replay" | "color" | "focus">) {
  const makes = useRef<THREE.InstancedMesh>(null!), misses = useRef<THREE.InstancedMesh>(null!);
  const n = idx.length;
  const prefix = useMemo(() => {
    const p = new Uint32Array(n + 1);
    if (shots) idx.forEach((si, k) => (p[k + 1] = p[k] + shots.m[si]));
    return p;
  }, [shots, idx, n]);
  useLayoutEffect(() => {
    if (!shots || !makes.current || !misses.current) return;
    const d = new THREE.Object3D(); let a = 0, b = 0; const s = focus ? 1.9 : 1;
    idx.forEach((si) => {
      d.position.set(shots.x[si] / 10, 0.03, shots.y[si] / 10); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.setScalar(s); d.updateMatrix();
      if (shots.m[si]) makes.current.setMatrixAt(a++, d.matrix); else misses.current.setMatrixAt(b++, d.matrix);
    });
    makes.current.instanceMatrix.needsUpdate = true; misses.current.instanceMatrix.needsUpdate = true;
  }, [shots, idx, focus]);
  useFrame(() => {
    if (!makes.current) return;
    const k = Math.max(0, Math.min(n, Math.floor(replay.current.shown)));
    makes.current.count = prefix[k]; misses.current.count = k - prefix[k];
  });
  const cap = Math.max(1, n);
  const bright = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45), [color]);
  return (
    <>
      <instancedMesh key={"mk" + cap} ref={makes} args={[undefined, undefined, cap]} frustumCulled={false} renderOrder={1}>
        <ringGeometry args={[0.26, 0.42, 24]} />
        <meshBasicMaterial color={bright} transparent opacity={focus ? 1 : 0.85} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={"ms" + cap} ref={misses} args={[undefined, undefined, cap]} frustumCulled={false} renderOrder={1}>
        <circleGeometry args={[0.17, 12]} />
        <meshBasicMaterial color="#ff4d5e" transparent opacity={focus ? 0.9 : 0.5} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** The ball in flight, plus a pulsing ring on the floor where the current shot was taken. */
function LiveShot({ shots, idx, moves, replay, color }: Pick<Props, "shots" | "idx" | "moves" | "replay" | "color">) {
  const ball = useRef<THREE.Mesh>(null!), ring = useRef<THREE.Mesh>(null!), tmp = useRef([0, 0, 0]);
  useFrame(({ clock }) => {
    const r = replay.current, k = r.flying;
    const on = !!shots && k >= 0 && k < idx.length;
    ball.current.visible = on && r.u < 1; ring.current.visible = on;
    if (!on) return;
    const si = idx[k];
    arcPoint(shots!.x[si], shots!.y[si], shots!.m[si], moves[shots!.a[si]], si, Math.min(1, r.u), tmp.current);
    ball.current.position.set(tmp.current[0], tmp.current[1], tmp.current[2]);
    ball.current.rotation.x -= 0.25;
    ring.current.position.set(shots!.x[si] / 10, 0.05, shots!.y[si] / 10);
    ring.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 6));
  });
  return (
    <>
      <mesh ref={ball} visible={false} castShadow>
        <sphereGeometry args={[0.4, 20, 14]} />
        <meshStandardMaterial color="#e2702a" emissive="#5a2400" roughness={0.75} />
      </mesh>
      <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2} renderOrder={3}>
        <ringGeometry args={[1.0, 1.25, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

function CameraRig({ cam, camNonce }: { cam: CamKey; camNonce: number }) {
  const controls = useRef<any>(null), camera = useThree((s) => s.camera), size = useThree((s) => s.size);
  const tween = useRef<{ t: number; fp: THREE.Vector3; tp: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3 } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const c = CAMS[cam], tt = new THREE.Vector3(...c.t), tp = new THREE.Vector3(...c.p);
    if (size.width / size.height < 1.1) tp.sub(tt).multiplyScalar(1.45).add(tt); // pull back on tall screens
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (first.current || reduce) {
      first.current = false; camera.position.copy(tp);
      if (controls.current) { controls.current.target.copy(tt); controls.current.update(); }
      return;
    }
    tween.current = { t: 0, fp: camera.position.clone(), tp, ft: controls.current.target.clone(), tt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, camNonce]);
  useFrame((_, dt) => {
    const w = tween.current; if (!w || !controls.current) return;
    w.t = Math.min(1, w.t + dt / 1.1);
    const e = w.t < 0.5 ? 4 * w.t ** 3 : 1 - Math.pow(-2 * w.t + 2, 3) / 2;
    camera.position.lerpVectors(w.fp, w.tp, e); controls.current.target.lerpVectors(w.ft, w.tt, e); controls.current.update();
    if (w.t >= 1) tween.current = null;
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.07} minDistance={14} maxDistance={130} maxPolarAngle={Math.PI / 2 - 0.05}
    onStart={() => (tween.current = null)} />;
}

export default function Scene(props: Props) {
  const { color, lite } = props;
  const [fontTick, setFontTick] = useState(0); // repaint signage once the display font has loaded
  useEffect(() => { (document as any).fonts?.ready.then(() => setFontTick(1)); }, []);
  return (
    <Canvas shadows={!lite} dpr={[1, lite ? 1.5 : 2]} camera={{ fov: 36, near: 0.5, far: 900, position: CAMS.main.p }} gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="3D basketball court showing this player's shots" role="img">
      <color attach="background" args={["#030407"]} />
      <fog attach="fog" args={["#030407", 190, 560]} />
      <Lights color={color} lite={lite} />
      <Floor color={color} lite={lite} fontTick={fontTick} />
      <Hoop color={color} />
      <Arena color={color} fontTick={fontTick} />
      <Markers {...props} />
      <Trails {...props} />
      <LiveShot {...props} />
      <CameraRig cam={props.cam} camNonce={props.camNonce} />
      {!lite && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.62} luminanceSmoothing={0.25} />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
