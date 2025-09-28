import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
// Background asset (bundled) — safe for GitHub Pages
import bg from "./assets/bg.jpg";

// ===== Helpers
const degToRad = (d) => (d * Math.PI) / 180;
const wrapDeg = (d) => ((d % 360) + 360) % 360;

// Detect if the sweep crossed a target degree (clockwise), handling wrap-around
const crossed = (prev, curr, target) => {
  prev = wrapDeg(prev); curr = wrapDeg(curr); target = wrapDeg(target);
  if (prev <= curr) return prev < target && target <= curr;
  return target > prev || target <= curr;
};

// ===== Signs & Houses
const SIGNS = [
  { key: "Aries", glyph: "♈", deg: 0 },
  { key: "Taurus", glyph: "♉", deg: 30 },
  { key: "Gemini", glyph: "♊", deg: 60 },
  { key: "Cancer", glyph: "♋", deg: 90 },
  { key: "Leo", glyph: "♌", deg: 120 },
  { key: "Virgo", glyph: "♍", deg: 150 },
  { key: "Libra", glyph: "♎", deg: 180 },
  { key: "Scorpio", glyph: "♏", deg: 210 },
  { key: "Sagittarius", glyph: "♐", deg: 240 },
  { key: "Capricorn", glyph: "♑", deg: 270 },
  { key: "Aquarius", glyph: "♒", deg: 300 },
  { key: "Pisces", glyph: "♓", deg: 330 },
];

const HOUSES = [
  { key: "I", deg: 0 }, { key: "II", deg: 30 }, { key: "III", deg: 60 },
  { key: "IV", deg: 90 }, { key: "V", deg: 120 }, { key: "VI", deg: 150 },
  { key: "VII", deg: 180 }, { key: "VIII", deg: 210 }, { key: "IX", deg: 240 },
  { key: "X", deg: 270 }, { key: "XI", deg: 300 }, { key: "XII", deg: 330 },
];

// ===== Planets (fixed degrees) + euphoric chiptune defaults
const PLANETS = [
  { key: "Sun", glyph: "☉", deg: 311.59, instrument: "lead" },
  { key: "Moon", glyph: "☽", deg: 52.1, instrument: "pad" },
  { key: "Mercury", glyph: "☿", deg: 317.52, instrument: "arp" },
  { key: "Venus", glyph: "♀", deg: 358.29, instrument: "bell" },
  { key: "Mars", glyph: "♂", deg: 100.01, instrument: "snare" },
  { key: "Jupiter", glyph: "♃", deg: 194.41, instrument: "bass" },
  { key: "Saturn", glyph: "♄", deg: 319.52, instrument: "pad" },
  { key: "Uranus", glyph: "♅", deg: 289.29, instrument: "hat" },
  { key: "Neptune", glyph: "♆", deg: 289.31, instrument: "hat" },
  { key: "Pluto", glyph: "♇", deg: 235.21, instrument: "tom" },
  { key: "Lilith", glyph: "⚸", deg: 351.59, instrument: "clap" },
  { key: "NNode", glyph: "☊", deg: 260.15, instrument: "bell" },
  { key: "Asc", glyph: "ASC", deg: 171.45, instrument: "kick" },
  { key: "MC", glyph: "MC", deg: 78.8, instrument: "lead" },
];

// Keep a copy of the original planet->instrument mapping for hard reset
const ORIGINAL_INSTRUMENTS = Object.fromEntries(PLANETS.map(p => [p.key, p.instrument]));

// ===== Scale (bright & safe)
const SCALE = [
  "G3","A3","B3","D4","E4",
  "G4","A4","B4","D5","E5",
  "G5","A5","B5","D6","E6"
];
const pick = (i) => SCALE[(i % SCALE.length + SCALE.length) % SCALE.length];

// ==== Cute sound library (all prebuilt to avoid swaps glitching)
const SOUND_LIBRARY = [
  { key: "kick", label: "Kick (thump)" },
  { key: "snare", label: "Snare (snap)" },
  { key: "clap", label: "Clap (cute)" },
  { key: "hat", label: "Hat (tsss)" },
  { key: "tom", label: "Tom (boop)" },
  { key: "bass", label: "Chip Bass" },
  { key: "lead", label: "Square Lead (pew)" },
  { key: "arp", label: "Arp (sparkle)" },
  { key: "pad", label: "Soft Pad" },
  { key: "bell", label: "Bell (ping)" },
  { key: "pluck", label: "Pluck (pixie)" },
  { key: "pulse", label: "Pulse Lead (cute)" },
  { key: "blip", label: "Blip (game coin)" },
];

// Easy knobs for background alignment/size
const BG_SIZE_PX = 765; // shrink or grow the bg image around the circle
const BG_POS = "center"; // e.g. "center 48%" to nudge down a touch

export default function AstroSonar() {
  // --- UI state
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(60); // 60..180
  const tempo = useMemo(() => 360 * (bpm / 60), [bpm]); // deg/sec
  const [angle, setAngle] = useState(0);

  // --- FX single sliders (wet only)
  const [distWet, setDistWet] = useState(0.15);
  const [filtWet, setFiltWet] = useState(0.10);
  const [delWet, setDelWet] = useState(0.18);
  const [revWet, setRevWet] = useState(0.12);

  // --- animation/time
  const rafRef = useRef(null);
  const baseTimeRef = useRef(null);
  const baseAngleRef = useRef(0);
  const prevAngleRef = useRef(0);

  // --- audio graph
  const builtRef = useRef(false);
  const mixRef = useRef(null);
  const masterRef = useRef(null);
  const gainsRef = useRef({});
  const distortionRef = useRef(null);
  const autoFilterRef = useRef(null);
  const delayRef = useRef(null);
  const reverbRef = useRef(null);

  // per-planet instrument slot: { current: 'lead', nodes: { [key]: synth } }
  const synthsRef = useRef({});
  const instrumentMap = useRef(Object.fromEntries(PLANETS.map(p => [p.key, p.instrument])));

  // build simple synths that are audible & safe in Tone v15 core
  const makeSynth = (kind) => {
    switch (kind) {
      case "kick": return new Tone.MembraneSynth({ octaves: 3, pitchDecay: 0.06, envelope:{attack:0.001,decay:0.18,sustain:0,release:0.12}, volume:-1 });
      case "snare": return new Tone.NoiseSynth({ envelope:{attack:0.001,decay:0.12,sustain:0,release:0.05}, volume:-2 });
      case "clap": return new Tone.NoiseSynth({ envelope:{attack:0.001,decay:0.08,sustain:0,release:0.03}, volume:-3 });
      case "hat": return new Tone.NoiseSynth({ envelope:{attack:0.001,decay:0.02,sustain:0,release:0.015}, volume:-6 });
      case "tom": return new Tone.MembraneSynth({ octaves: 2, pitchDecay: 0.02, envelope:{attack:0.001,decay:0.12,sustain:0,release:0.1}, volume:-2 });
      case "bass": return new Tone.MonoSynth({ oscillator:{type:"square"}, envelope:{attack:0.003,decay:0.1,sustain:0.7,release:0.12}, volume:-2 });
      case "lead": return new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.003,decay:0.1,sustain:0.28,release:0.12}, volume:-3 });
      case "arp": return new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.002,decay:0.08,sustain:0.25,release:0.09}, volume:-4 });
      case "pad": return new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.01,decay:0.1,sustain:0.35,release:0.25}, volume:-6 });
      case "bell": return new Tone.Synth({ oscillator:{type:"sine"}, envelope:{attack:0.002,decay:0.4,sustain:0,release:0.22}, volume:-4 });
      case "pluck": return new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.001,decay:0.08,sustain:0,release:0.05}, volume:-4 });
      case "pulse": return new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.002,decay:0.08,sain:0.28,release:0.09}, volume:-3 });
      case "blip": return new Tone.Synth({ oscillator:{type:"sine"}, envelope:{attack:0.001,decay:0.05,sustain:0,release:0.03}, volume:-4 });
      default: return new Tone.Synth();
    }
  };

  const buildGraph = () => {
    if (builtRef.current) return;

    const mix = new Tone.Gain(1);
    const master = new Tone.Gain(1);

    // core-safe FX (feature-detected)
    const distortion = Tone?.Distortion ? new Tone.Distortion() : null;
    const autoFilter = Tone?.AutoFilter ? new Tone.AutoFilter({ frequency: 1.5, baseFrequency: 200, octaves: 3, type: "sine" }).start() : null;
    const feedbackDelay = Tone?.FeedbackDelay ? new Tone.FeedbackDelay({ delayTime: "3n", feedback: 0.25 }) : (Tone?.Delay ? new Tone.Delay("3n") : null);
    const reverb = Tone?.Reverb ? new Tone.Reverb({ decay: 2.5, preDelay: 0.01 }) : null;

    // initial wets
    if (distortion?.wet) distortion.wet.value = distWet;
    if (autoFilter?.wet) autoFilter.wet.value = filtWet;
    if (feedbackDelay?.wet) feedbackDelay.wet.value = delWet;
    if (reverb?.wet) reverb.wet.value = revWet;

    // chain: mix -> [fx exist?] -> master -> destination
    let last = mix;
    const add = (node, ref) => { if (!node) return; last.connect(node); last = node; if (ref) ref.current = node; };
    add(distortion, distortionRef);
    add(autoFilter, autoFilterRef);
    add(feedbackDelay, delayRef);
    add(reverb, reverbRef);
    last.connect(master);

    const destination = (Tone.getDestination && Tone.getDestination()) || Tone.Destination || Tone.getContext?.().destination;
    if (destination) master.connect(destination);

    mixRef.current = mix; masterRef.current = master;

    // per-planet gains + prebuilt synth nodes (for glitch-free swapping)
    const gains = {}; const synths = {};
    PLANETS.forEach(p => {
      const g = new Tone.Gain(1);
      g.connect(mix);
      g.connect(master); // bypass path -> guarantees sound
      const nodes = {};
      SOUND_LIBRARY.forEach(({ key }) => {
        const node = makeSynth(key);
        node.connect(g);
        nodes[key] = node;
      });
      gains[p.key] = g;
      synths[p.key] = { current: instrumentMap.current[p.key], nodes };
    });
    gainsRef.current = gains; synthsRef.current = synths;

    builtRef.current = true;
  };

  const disposeGraph = () => {
    if (!builtRef.current) return;
    Object.values(synthsRef.current).forEach(slot => Object.values(slot.nodes).forEach(n => n?.dispose?.()));
    Object.values(gainsRef.current).forEach(g => g.dispose?.());
    distortionRef.current?.dispose?.();
    autoFilterRef.current?.dispose?.();
    delayRef.current?.dispose?.();
    reverbRef.current?.dispose?.();
    masterRef.current?.dispose?.();
    mixRef.current?.dispose?.();
    synthsRef.current = {}; gainsRef.current = {};
    builtRef.current = false;
  };
  useEffect(() => () => disposeGraph(), []);

  // animation loop
  useEffect(() => {
    if (!running) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    const loop = (ts) => {
      const secs = ts / 1000;
      if (baseTimeRef.current == null) baseTimeRef.current = secs;
      const curr = wrapDeg(baseAngleRef.current + (secs - baseTimeRef.current) * tempo);
      const prev = prevAngleRef.current;

      if (builtRef.current) {
        PLANETS.forEach((p, idx) => { if (crossed(prev, curr, p.deg)) triggerPlanet(p, idx); });
      }

      prevAngleRef.current = curr;
      setAngle(curr);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [running, tempo]);

  const triggerPlanet = (p, idx) => {
    const slot = synthsRef.current[p.key];
    if (!slot) return;
    const node = slot.nodes[slot.current];
    if (!node) return;
    const t = Tone.now();
    const note = pick((idx * 3) % SCALE.length);

    switch (slot.current) {
      case "kick": node.triggerAttackRelease("G1", "8n", t); break;
      case "snare": node.triggerAttackRelease("16n", t); break;
      case "clap": node.triggerAttackRelease("16n", t); break;
      case "hat": node.triggerAttackRelease("32n", t); break;
      case "tom": node.triggerAttackRelease("D2", "16n", t); break;
      case "bass": node.triggerAttackRelease(pick(0), "8n", t); break;
      case "lead": node.triggerAttackRelease(note, "8n", t); break;
      case "arp": node.triggerAttackRelease(pick(idx+2), "16n", t); break;
      case "pad": node.triggerAttackRelease(pick(idx+4), "4n", t); break;
      case "bell": node.triggerAttackRelease(pick(idx+6), "8n", t); break;
      case "pluck": node.triggerAttack(note, t); node.triggerRelease(t + Tone.Time("8n").toSeconds()); break;
      case "pulse": node.triggerAttackRelease(note, "8n", t); break;
      case "blip": node.triggerAttackRelease("E6", "32n", t); break;
      default: node.triggerAttackRelease(note, "8n", t); break;
    }
  };

  const handlePlayPause = async () => {
    if (!running) {
      await Tone.start();
      buildGraph();
      // tiny test beep so you know audio path is alive
      new Tone.Synth().toDestination().triggerAttackRelease("A4", "16n", Tone.now() + 0.05);
      baseTimeRef.current = null;
      prevAngleRef.current = baseAngleRef.current;
      setRunning(true);
    } else {
      baseAngleRef.current = angle;
      setRunning(false);
    }
  };

  const reset = () => {
    baseAngleRef.current = 0;
    prevAngleRef.current = 0;
    setAngle(0);
    setBpm(60);

    instrumentMap.current = { ...ORIGINAL_INSTRUMENTS };
    Object.keys(synthsRef.current || {}).forEach(k => { if (synthsRef.current[k]) synthsRef.current[k].current = ORIGINAL_INSTRUMENTS[k]; });

    const d=0.15,f=0.10,l=0.18,r=0.12;
    setDistWet(d); setFiltWet(f); setDelWet(l); setRevWet(r);
    if (distortionRef.current?.wet) distortionRef.current.wet.value = d;
    if (autoFilterRef.current?.wet) autoFilterRef.current.wet.value = f;
    if (delayRef.current?.wet) delayRef.current.wet.value = l;
    if (reverbRef.current?.wet) reverbRef.current.wet.value = r;

    if (!builtRef.current) buildGraph();
    if (running) { baseTimeRef.current = null; prevAngleRef.current = baseAngleRef.current; }
  };

  const tempoBadge = (x) => x === 60 ? "MEDITATE" : (x >= 100 && x <= 150 ? "WORK BITCH!" : (x >= 160 ? "RAVE!" : "FLOW"));
  const tempoColor = (x) => (x <= 90 ? "#39FF14" : x <= 150 ? "#f59e0b" : "#ef4444");

  return (
    <div style={{
      background: "#000",
      color: "#39FF14",
      minHeight: "100vh",
      padding: 20
    }}>
      <h1 style={{textAlign:"center", fontSize:32, marginBottom:20}}>REMIX ME</h1>

      <div style={{display:"flex", gap:12, marginBottom:12, alignItems:"center", flexWrap:"wrap"}}>
        <button onClick={handlePlayPause}>{running ? "Pause" : "Play"}</button>
        <button onClick={reset}>Reset</button>
        <div style={{marginLeft:16, minWidth:260, flex:1}}>
          <label>Tempo {bpm} BPM</label>
          <input type="range" min={60} max={180} step={1} value={bpm} onChange={(e)=>setBpm(parseInt(e.target.value))} />
        </div>
        <div style={{background:tempoColor(bpm), color:"#000", padding:"4px 8px", borderRadius:999, fontWeight:800}}>{tempoBadge(bpm)}</div>
      </div>

      {/* FX — one slider each (wet only) */}
      <div style={{display:"flex", gap:16, alignItems:"center", flexWrap:"wrap", marginBottom:10}}>
        <Control label="Distortion">
          <input type="range" min={0} max={1} step={0.01} value={distWet}
            onChange={(e)=>{ const v=parseFloat(e.target.value); setDistWet(v); if(distortionRef.current?.wet){distortionRef.current.wet.value=v;} }} />
        </Control>
        <Control label="Filter">
          <input type="range" min={0} max={1} step={0.01} value={filtWet}
            onChange={(e)=>{ const v=parseFloat(e.target.value); setFiltWet(v); if(autoFilterRef.current?.wet){autoFilterRef.current.wet.value=v;} }} />
        </Control>
        <Control label="Delay">
          <input type="range" min={0} max={1} step={0.01} value={delWet}
            onChange={(e)=>{ const v=parseFloat(e.target.value); setDelWet(v); if(delayRef.current?.wet){delayRef.current.wet.value=v;} }} />
        </Control>
        <Control label="Reverb">
          <input type="range" min={0} max={1} step={0.01} value={revWet}
            onChange={(e)=>{ const v=parseFloat(e.target.value); setRevWet(v); if(reverbRef.current?.wet){reverbRef.current.wet.value=v;} }} />
        </Control>
      </div>

      {/* Background image ONLY behind the sonar, perfectly centered & size-tunable */}
      <div style={{
        position: "relative",
        width: "100%",
        height: 750,
        display: "grid",
        placeItems: "center",
        backgroundImage: `url(${bg})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: BG_POS,
        backgroundSize: `${BG_SIZE_PX}px auto`
      }}>
        <Scene angle={angle} />
      </div>
    </div>
  );
}

function Control({ label, children }) {
  return (
    <div style={{display:"flex", gap:8, alignItems:"center"}}>
      <small style={{width:70, display:"inline-block"}}>{label}</small>
      {children}
    </div>
  );
}

function Scene({ angle }) {
  const size = 600;
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const neon = "#39FF14";
  const wedgeWidth = 45; // visual only
  const toXY = (deg, rad) => { const a = degToRad(-deg + 90); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{width:"100%", height:520}}>
      {/* outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={neon} strokeWidth={2}/>

      {/* zodiac glyphs — highlighted only in the active wedge */}
      {SIGNS.map((s)=>{
        const distRaw = Math.abs(wrapDeg(angle) - s.deg);
        const dist = Math.min(distRaw, 360 - distRaw);
        const within = dist <= wedgeWidth/2;
        const [gx, gy] = toXY(s.deg, r+30);
        const fs = within ? 22 : 14;
        return <text key={s.key} x={gx} y={gy} textAnchor="middle" fontSize={fs} fill={neon} opacity={within?1:0}>{s.glyph}</text>;
      })}

      {/* houses */}
      {HOUSES.map((h)=>{
        const [hx, hy] = toXY(h.deg, r+55);
        return <text key={h.key} x={hx} y={hy} textAnchor="middle" fontSize={12} fill="white">{h.key}</text>;
      })}

      {/* planets */}
      {PLANETS.map((p)=>{
        const [px, py] = toXY(p.deg, r);
        return (
          <g key={p.key}>
            <circle cx={px} cy={py} r={6} fill="black" stroke={neon} strokeWidth={2}/>
            <text x={px} y={py-12} textAnchor="middle" fontSize={20} fill={neon}>{p.glyph}</text>
          </g>
        );
      })}

      {/* sonar wedge */}
      {(() => {
        const a1 = angle - wedgeWidth/2;
        const a2 = angle + wedgeWidth/2;
        const [x1,y1] = toXY(a1, r);
        const [x2,y2] = toXY(a2, r);
        const dW = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
        return (<path d={dW} fill={neon} opacity={0.15}/>);
      })()}

      {/* curved sweep line with glow */}
      {(() => {
        const [sx, sy] = toXY(angle, r);
        const [ctrlX, ctrlY] = toXY(angle, r * 1.08);
        const d = `M${cx},${cy} Q${ctrlX},${ctrlY} ${sx},${sy}`;
        return (
          <g>
            <path d={d} stroke={neon} strokeOpacity={0.1} strokeWidth={12} strokeLinecap="round" fill="none" />
            <path d={d} stroke={neon} strokeOpacity={0.22} strokeWidth={6} strokeLinecap="round" fill="none" />
            <path d={d} stroke={neon} strokeWidth={2} strokeLinecap="round" fill="none" />
          </g>
        );
      })()}
    </svg>
  );
}
