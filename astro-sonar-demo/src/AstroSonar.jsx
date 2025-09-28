import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

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

// ===== Euphoric chiptune palette
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

export default function AstroSonar() {
  // ---------- UI State
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(60); // start at 60, user can go to 180
  const tempo = useMemo(() => 360 * (bpm / 60), [bpm]); // deg/sec
  const [angle, setAngle] = useState(0);

  // ---------- Animation
  const rafRef = useRef(null);
  const baseTimeRef = useRef(null);
  const baseAngleRef = useRef(0);
  const prevAngleRef = useRef(0);

  // ---------- Audio Graph Refs
  const builtRef = useRef(false);
  const mixRef = useRef(null);
  const reverbRef = useRef(null);
  const delayRef = useRef(null);
  const distortionRef = useRef(null);
  const autoFilterRef = useRef(null);
  const compressorRef = useRef(null);
  const lpfRef = useRef(null);
  const hpfRef = useRef(null);
  const masterRef = useRef(null);
  const gainsRef = useRef({});
  // synthsRef structure: { [planetKey]: { current: soundKey, nodes: { [soundKey]: ToneInstrument } } }
  const synthsRef = useRef({});
  const instrumentMap = useRef(Object.fromEntries(PLANETS.map(p => [p.key, p.instrument])));
  const [, forceRerender] = useState(0);

  // ---------- Self-tests (dev sanity checks)
  useEffect(() => {
    const keys = SOUND_LIBRARY.map(s => s.key);
    console.assert(new Set(keys).size === keys.length, "SOUND_LIBRARY keys must be unique");
    const planetKeys = PLANETS.map(p => p.key);
    console.assert(new Set(planetKeys).size === planetKeys.length, "PLANETS keys must be unique");
    PLANETS.forEach(p => console.assert(keys.includes(p.instrument), `Default instrument for ${p.key} not in SOUND_LIBRARY`));
  }, []);

  // ---------- Instrument Builders (all audible at default settings)
  const makeSynth = (kind) => {
    const has = (c) => typeof c === "function";
    switch (kind) {
      case "kick": return has(Tone.MembraneSynth)
        ? new Tone.MembraneSynth({ octaves: 2, pitchDecay: 0.03, envelope:{attack:0.001,decay:0.16,sustain:0,release:0.08}, volume:-2 })
        : new Tone.MonoSynth({ oscillator:{type:"sine"}, envelope:{attack:0.001,decay:0.12,sustain:0,release:0.08}, volume:-2 });
      case "snare": return has(Tone.NoiseSynth)
        ? new Tone.NoiseSynth({ envelope:{attack:0.001,decay:0.12,sustain:0,release:0.05}, volume:-4 })
        : new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.001,decay:0.08,sustain:0,release:0.05}, volume:-4 });
      case "clap": return has(Tone.NoiseSynth)
        ? new Tone.NoiseSynth({ noise:{type:"white"}, envelope:{attack:0.001,decay:0.09,sustain:0,release:0.02}, volume:-6 })
        : new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.001,decay:0.06,sustain:0,release:0.02}, volume:-6 });
      case "hat": return has(Tone.NoiseSynth)
        ? new Tone.NoiseSynth({ envelope:{attack:0.001, decay:0.02, sustain:0, release:0.015}, volume:-8 })
        : new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.001,decay:0.02,sustain:0,release:0.015}, volume:-8 });
      case "tom": return has(Tone.MembraneSynth)
        ? new Tone.MembraneSynth({ octaves: 1.5, pitchDecay: 0.01, envelope:{attack:0.001,decay:0.1,sustain:0,release:0.08}, volume:-4 })
        : new Tone.MonoSynth({ oscillator:{type:"sine"}, envelope:{attack:0.001,decay:0.08,sustain:0,release:0.07}, volume:-4 });
      case "bass": return has(Tone.MonoSynth)
        ? new Tone.MonoSynth({ oscillator:{type:"square"}, filter:{type:"lowpass", Q:8}, envelope:{attack:0.003,decay:0.1,sustain:0.6,release:0.1}, filterEnvelope:{attack:0.002,decay:0.08,sustain:0.3,release:0.08,baseFrequency:110,octaves:2}, volume:-6 })
        : new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.005,decay:0.12,sustain:0.5,release:0.1}, volume:-6 });
      case "lead": return new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.003,decay:0.1,sustain:0.25,release:0.1}, volume:-6 });
      case "arp": return has(Tone.AMSynth)
        ? new Tone.AMSynth({ oscillator:{type:"square"}, envelope:{attack:0.002,decay:0.08,sustain:0.2,release:0.08}, volume:-8 })
        : new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.002,decay:0.08,sustain:0.2,release:0.08}, volume:-8 });
      case "pad": return new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.01,decay:0.1,sustain:0.3,release:0.2}, volume:-10 });
      case "bell": return has(Tone.FMSynth)
        ? new Tone.FMSynth({ harmonicity:6, modulationIndex:140, oscillator:{type:"sine"}, modulation:{type:"square"}, envelope:{attack:0.002,decay:0.45,sustain:0,release:0.18}, volume:-8 })
        : new Tone.Synth({ oscillator:{type:"sine"}, envelope:{attack:0.002,decay:0.4,sustain:0,release:0.2}, volume:-8 });
      case "pluck": return has(Tone.PluckSynth)
        ? new Tone.PluckSynth({ attackNoise: 0.6, dampening: 5000, resonance: 0.6 })
        : new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.001,decay:0.08,sustain:0,release:0.05}, volume:-8 });
      case "pulse": return has(Tone.PWMSynth)
        ? new Tone.PWMSynth({ envelope:{attack:0.002,decay:0.08,sustain:0.25,release:0.08}, modulationFrequency: 6, volume:-6 })
        : new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.002,decay:0.08,sustain:0.25,release:0.08}, volume:-6 });
      case "blip": return new Tone.Synth({ oscillator:{type:"sine"}, envelope:{attack:0.001,decay:0.05,sustain:0,release:0.03}, volume:-8 });
      default: return new Tone.Synth();
    }
  };

  // ---------- Build Audio Graph
  const buildGraph = () => {
    if (builtRef.current) return;

    // Base nodes
    const mix = new Tone.Gain(1);
    const master = new Tone.Gain(1);

    // Feature-detect Tone v15+ classes; only create what exists in this build
    const distortion = Tone?.Distortion ? new Tone.Distortion({ distortion: 0.2, wet: 0.15 }) : null;
    const autoFilter = Tone?.AutoFilter ? new Tone.AutoFilter({ frequency: 1.5, baseFrequency: 200, octaves: 3, type: "sine", wet: 0.1 }).start() : null;
    const feedbackDelay = Tone?.FeedbackDelay ? new Tone.FeedbackDelay({ delayTime: "3n", feedback: 0.25, wet: 0.18 }) : (Tone?.Delay ? new Tone.Delay("3n") : null);
    const reverb = Tone?.Reverb ? new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0.12 }) : null;
    const hpf = Tone?.Filter ? new Tone.Filter(40, "highpass") : null;
    const lpf = Tone?.Filter ? new Tone.Filter(16000, "lowpass") : null;
    const compressor = Tone?.Compressor ? new Tone.Compressor({ threshold: -12, ratio: 12, attack: 0.003, release: 0.25 }) : null;

    // Wire chain safely: mix -> [fx that exist...] -> master -> destination
    let last = mix;
    const add = (node, ref) => { if (!node) return; last.connect(node); last = node; if (ref) ref.current = node; };

    add(distortion, distortionRef);
    add(autoFilter, autoFilterRef);
    add(feedbackDelay, delayRef);
    add(reverb, reverbRef);
    add(hpf, hpfRef);
    add(lpf, lpfRef);
    add(compressor, compressorRef);
    last.connect(master);

    const destination = Tone.getDestination ? Tone.getDestination() : Tone.Destination;
    master.connect(destination);

    mixRef.current = mix;
    masterRef.current = master;

    const gains = {}; const synths = {};
    PLANETS.forEach((p) => {
      const g = new Tone.Gain(1).connect(mix);
      const nodes = {};
      // Prebuild one node per library instrument for glitch-free swaps
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

  // ---------- Dispose
  const disposeGraph = () => {
    if (!builtRef.current) return;
    Object.values(synthsRef.current).forEach((slot) => {
      Object.values(slot.nodes).forEach((n) => n?.dispose?.());
    });
    Object.values(gainsRef.current).forEach((g) => g.dispose?.());
    reverbRef.current?.dispose?.();
    delayRef.current?.dispose?.();
    autoFilterRef.current?.dispose?.();
    distortionRef.current?.dispose?.();
    compressorRef.current?.dispose?.();
    lpfRef.current?.dispose?.();
    hpfRef.current?.dispose?.();
    masterRef.current?.dispose?.();
    mixRef.current?.dispose?.();
    synthsRef.current = {}; gainsRef.current = {};
    builtRef.current = false;
  };

  useEffect(() => () => disposeGraph(), []);

  // ---------- Animation loop (no hit-orb; exact crossings)
  useEffect(() => {
    if (!running) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    const loop = (ts) => {
      const secs = ts / 1000;
      if (baseTimeRef.current == null) baseTimeRef.current = secs;
      const curr = wrapDeg(baseAngleRef.current + (secs - baseTimeRef.current) * tempo);
      const prev = prevAngleRef.current;

      if (builtRef.current) {
        PLANETS.forEach((p, idx) => {
          if (crossed(prev, curr, p.deg)) triggerPlanet(p, idx);
        });
      }

      prevAngleRef.current = curr;
      setAngle(curr);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [running, tempo]);

  // ---------- Trigger logic
  const triggerPlanet = (p, idx) => {
    if (!builtRef.current) return;
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

  // ---------- Controls
  const handlePlayPause = async () => {
    if (!running) {
      console.log("[AstroSonar] Play clicked");
      await Tone.start(); // unlock audio context first
      buildGraph();
      baseTimeRef.current = null;
      prevAngleRef.current = baseAngleRef.current;
      setRunning(true);
    } else {
      console.log("[AstroSonar] Pause clicked");
      baseAngleRef.current = angle;
      setRunning(false);
    }
  };

  const reset = () => {
    baseAngleRef.current = 0;
    prevAngleRef.current = 0;
    setAngle(0);
    baseTimeRef.current = null;
  };

  const tempoBadge = (x) => x === 60 ? "MEDITATE" : (x >= 100 && x <= 150 ? "WORK BITCH!" : (x >= 160 ? "RAVE!" : "FLOW"));
  const tempoColor = (x) => (x <= 90 ? "#39FF14" : x <= 150 ? "#f59e0b" : "#ef4444");

  return (
    <div style={{background:"black", color:"#39FF14", minHeight:"100vh", padding:20}}>
      <h1 style={{textAlign:"center", fontSize:32, marginBottom:20}}>REMIX ME</h1>

      {/* Transport + Global FX */}
      <div style={{display:"flex", gap:12, marginBottom:12, alignItems:"center", flexWrap:"wrap"}}>
        <button onClick={handlePlayPause}>{running ? "Pause" : "Play"}</button>
        <button onClick={reset}>Reset</button>
        <div style={{marginLeft:16, minWidth:260, flex:1}}>
          <label>Tempo {bpm} BPM</label>
          <input type="range" min={60} max={180} step={1} value={bpm} onChange={(e)=>setBpm(parseInt(e.target.value))} />
        </div>
        <div style={{background:tempoColor(bpm), color:"#000", padding:"4px 8px", borderRadius:999, fontWeight:800}}>{tempoBadge(bpm)}</div>

        {/* Distortion */}
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <small>Distortion</small>
          <input type="range" min={0} max={1} step={0.01} defaultValue={0.2} onChange={(e)=> distortionRef.current && (distortionRef.current.distortion = parseFloat(e.target.value))} />
          <input type="range" min={0} max={1} step={0.01} defaultValue={0.15} onChange={(e)=> distortionRef.current && (distortionRef.current.wet.value = parseFloat(e.target.value))} />
        </div>
        {/* Filter LFO */}
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <small>Filter LFO</small>
          <input type="range" min={0} max={1} step={0.01} defaultValue={0.10} onChange={(e)=> autoFilterRef.current && (autoFilterRef.current.wet.value = parseFloat(e.target.value))} />
          <input type="range" min={0.1} max={8} step={0.1} defaultValue={1.5} onChange={(e)=> autoFilterRef.current && (autoFilterRef.current.frequency.value = parseFloat(e.target.value))} />
        </div>
        {/* Delay */}
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <small>Delay</small>
          <input type="range" min={0} max={1} step={0.01} defaultValue={0.18} onChange={(e)=> delayRef.current && (delayRef.current.wet.value = parseFloat(e.target.value))} />
          <input type="range" min={0} max={0.9} step={0.01} defaultValue={0.25} onChange={(e)=> delayRef.current && (delayRef.current.feedback.value = parseFloat(e.target.value))} />
        </div>
        {/* Reverb */}
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <small>Reverb</small>
          <input type="range" min={0} max={1} step={0.01} defaultValue={0.12} onChange={(e)=> reverbRef.current && (reverbRef.current.wet.value = parseFloat(e.target.value))} />
          <input type="range" min={0.1} max={0.95} step={0.01} defaultValue={0.45} onChange={(e)=> reverbRef.current && (reverbRef.current.decay = parseFloat(e.target.value))} />
        </div>
        {/* Filters */}
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <small>HPF</small>
          <input type="range" min={20} max={400} step={1} defaultValue={40} onChange={(e)=> hpfRef.current && (hpfRef.current.frequency.value = parseFloat(e.target.value))} />
          <small>LPF</small>
          <input type="range" min={2000} max={20000} step={100} defaultValue={16000} onChange={(e)=> lpfRef.current && (lpfRef.current.frequency.value = parseFloat(e.target.value))} />
        </div>
      </div>

      {/* Instrument routing panel */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12, marginBottom:12}}>
        {PLANETS.map((p)=> (
          <div key={p.key} style={{border:"1px solid #1f2937", borderRadius:12, padding:10, background:"#0b0b0b"}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
              <strong>{p.glyph} {p.key}</strong>
              <span style={{opacity:0.7}}>@{Math.round(p.deg)}°</span>
            </div>
            <select
              value={(synthsRef.current[p.key]?.current) || instrumentMap.current[p.key]}
              onChange={(e)=>{
                const val = e.target.value;
                instrumentMap.current[p.key] = val;
                if (synthsRef.current[p.key]) {
                  synthsRef.current[p.key].current = val; // instant, glitch-free swap (all nodes prewired)
                }
                forceRerender(x=>x+1);
              }}
              style={{width:"100%", background:"#111", color:"#39FF14", padding:6, borderRadius:8}}
            >
              {SOUND_LIBRARY.map(s=> <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <Scene angle={angle} />
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
    <svg viewBox={`0 0 ${size} ${size}`} style={{width:"100%", height:520, background:"#000"}}>
      {/* outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={neon} strokeWidth={2}/>

      {/* zodiac glyphs — visible only in the active wedge (intentional) */}
      {SIGNS.map((s)=>{
        const distRaw = Math.abs(wrapDeg(angle) - wrapDeg(s.deg));
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

      {/* visual wedge */}
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
