/**
 * The library's sound, loaded only once someone turns it on. The room tone and the chime are
 * synthesised; footsteps and the book are short CC0 recordings.
 */
type Clip = 'slide' | 'open' | 'close' | 'flip-1' | 'flip-2' | 'flip-3' | `step-${1 | 2 | 3 | 4 | 5}`;

const CLIPS: Clip[] = ['slide', 'open', 'close', 'flip-1', 'flip-2', 'flip-3', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5'];
const LEVEL: Record<string, number> = { slide: 0.55, open: 0.9, close: 0.5, flip: 0.45, step: 0.22 };
const ROOM_LEVEL = 0.035;
const ROOM_OPEN_HZ = 700;
const ROOM_READING_HZ = 260;

export interface Sound {
  play(clip: 'slide' | 'open' | 'close'): void;
  /** Pages fanning past as the book opens */
  riffle(): void;
  step(): void;
  /** The trail has reached the shelf */
  chime(): void;
  /** Muffle the room while a page is being read */
  reading(on: boolean): void;
  setEnabled(on: boolean): void;
}

function brownNoise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // fade the seam so the loop doesn't click
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[data.length - 1 - i]! *= k;
    data[i]! *= k;
  }
  return buffer;
}

async function decode(ctx: AudioContext, clip: Clip): Promise<AudioBuffer | null> {
  for (const ext of ['webm', 'm4a']) {
    try {
      const response = await fetch(`/sounds/${clip}.${ext}`);
      if (!response.ok) continue;
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch {
      // this browser can't decode the format; try the next
    }
  }
  return null;
}

export function createSound(): Sound {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const room = ctx.createBufferSource();
  room.buffer = brownNoise(ctx, 6);
  room.loop = true;
  const roomFilter = ctx.createBiquadFilter();
  roomFilter.type = 'lowpass';
  roomFilter.frequency.value = ROOM_OPEN_HZ;
  const roomGain = ctx.createGain();
  roomGain.gain.value = ROOM_LEVEL;
  room.connect(roomFilter).connect(roomGain).connect(master);
  // a faint mains-like hum under the hush, as in any old building with lamps
  for (const [hz, level] of [[55, 0.012], [110, 0.006]] as const) {
    const hum = ctx.createOscillator();
    hum.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = level;
    hum.connect(g).connect(roomFilter);
    hum.start();
  }
  room.start();

  const buffers = new Map<Clip, AudioBuffer>();
  void Promise.all(CLIPS.map(async (c) => {
    const b = await decode(ctx, c);
    if (b) buffers.set(c, b);
  }));

  let enabled = false;
  let lastStep = 0;

  const fire = (clip: Clip, level: number, when = 0, rate = 1) => {
    const buffer = buffers.get(clip);
    if (!enabled || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(master);
    src.start(ctx.currentTime + when);
  };

  addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend();
    else if (enabled) void ctx.resume();
  });

  return {
    play(clip) {
      fire(clip, LEVEL[clip]!);
    },
    riffle() {
      for (let i = 0; i < 6; i++) fire(`flip-${(i % 3) + 1}` as Clip, LEVEL.flip! * (0.7 + 0.3 * Math.random()), 0.12 + i * 0.13, 0.95 + Math.random() * 0.12);
    },
    step() {
      const now = ctx.currentTime;
      if (now - lastStep < 0.28) return;
      lastStep = now;
      fire(`step-${1 + Math.floor(Math.random() * 5)}` as Clip, LEVEL.step! * (0.8 + 0.4 * Math.random()), 0, 0.92 + Math.random() * 0.16);
    },
    chime() {
      if (!enabled) return;
      // a small bell: a fundamental and two inharmonic partials, each fading at its own pace
      const t = ctx.currentTime;
      for (const [ratio, level, decay] of [[1, 0.09, 2.4], [2.76, 0.035, 1.3], [5.4, 0.015, 0.7]] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 784 * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + decay + 0.05);
      }
    },
    reading(on) {
      roomFilter.frequency.setTargetAtTime(on ? ROOM_READING_HZ : ROOM_OPEN_HZ, ctx.currentTime, 0.4);
    },
    setEnabled(on) {
      enabled = on;
      if (on) void ctx.resume();
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.25);
      if (!on) setTimeout(() => !enabled && void ctx.suspend(), 1200);
    },
  };
}
