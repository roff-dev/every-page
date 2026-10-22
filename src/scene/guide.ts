import {
  AdditiveBlending, BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, Mesh, Points, ShaderMaterial, Vector3,
} from 'three';
import { GUIDE_LIGHTS } from './materials';
import { LAMP_HEIGHT, LAMP_Z } from './dimensions';

/** A ribbon of light along the walk, drawn from the visitor's feet towards the book. */
export class Trail {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor(points: Vector3[], floorY: number) {
    const curve = new CatmullRomCurve3(points.map((p) => p.clone().setY(floorY + 0.015)), false, 'centripetal');
    const n = 220;
    const width = 0.34;
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      const t = curve.getTangentAt(i / n);
      const side = new Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
      pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
      uv.push(i / n, 0, i / n, 1);
      if (i < n) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uDrawn: { value: 0 }, uFade: { value: 1 }, uLength: { value: curve.getLength() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uDrawn, uFade, uLength;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);
          // motes drifting towards the book
          float motes = 0.55 + 0.45 * smoothstep(0.55, 1.0, sin((vUv.x * uLength - uTime * 1.4) * 2.6));
          float drawn = 1.0 - smoothstep(uDrawn - 0.04, uDrawn, vUv.x);
          vec3 c = vec3(1.0, 0.72, 0.38) * across * motes * drawn * uFade * 0.75;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  set drawn(v: number) {
    this.mesh.material.uniforms.uDrawn!.value = v;
  }

  set fade(v: number) {
    this.mesh.material.uniforms.uFade!.value = v;
  }

  tick(seconds: number) {
    this.mesh.material.uniforms.uTime!.value = seconds;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** A soft, breathing glow behind the volume a search leads to. */
export class Halo {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  constructor(at: Vector3) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([at.x, at.y, at.z], 3));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: { uAmount: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uPixelRatio;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(260.0 / -mv.z, 24.0, 420.0) * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-r * r * 4.0) * uAmount * 0.45;
          gl_FragColor = vec4(vec3(1.0, 0.7, 0.36) * a, 1.0);
        }`,
    });
    this.points = new Points(g, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
  }

  set amount(v: number) {
    this.points.material.uniforms.uAmount!.value = v;
  }

  set pixelRatio(v: number) {
    this.points.material.uniforms.uPixelRatio!.value = v;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** The lamps of the hexagon before the target and of the target, in walking order. */
export function routeLamps(dropX: number, roomX: number, floorY: number): Vector3[] {
  const y = floorY + LAMP_HEIGHT;
  const first = [new Vector3(dropX, y, -LAMP_Z), new Vector3(dropX, y, LAMP_Z)];
  const second = [new Vector3(roomX, y, -LAMP_Z), new Vector3(roomX, y, LAMP_Z)];
  return [...first, ...second];
}

/** Brighten lamps one after another; `t` is seconds since the guide began. */
export function lightLamps(lamps: Vector3[], t: number, fade = 1) {
  for (let i = 0; i < GUIDE_LIGHTS.length; i++) {
    const lamp = lamps[i];
    if (!lamp) {
      GUIDE_LIGHTS[i]!.set(0, -1e4, 0, 0);
      continue;
    }
    const on = Math.min(1, Math.max(0, (t - 0.25 - i * 0.35) / 0.6));
    GUIDE_LIGHTS[i]!.set(lamp.x, lamp.y, lamp.z, on * on * (3 - 2 * on) * fade);
  }
}

export function clearLamps() {
  for (const l of GUIDE_LIGHTS) l.set(0, -1e4, 0, 0);
}
