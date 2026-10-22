import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import common from './shaders/common.glsl?raw';
import vert from './shaders/library.vert?raw';
import frag from './shaders/library.frag?raw';
import { FLOOR_HEIGHT, LAMP_HEIGHT, LAMP_Z, PITCH_X, WALL_TOP } from './dimensions';

export const FOG = new Color(0x2b1710);

/** Lamps along a guided route (xyz, strength). One shared array, read by every material. */
export const GUIDE_LIGHTS = Array.from({ length: 6 }, () => new Vector4(0, -1e4, 0, 0));

export function libraryMaterial({ books = false } = {}) {
  return new ShaderMaterial({
    vertexColors: true,
    side: DoubleSide,
    defines: books ? { BOOKS: '' } : {},
    uniforms: {
      uPitchX: { value: PITCH_X },
      uFloorHeight: { value: FLOOR_HEIGHT },
      uRoomOffset: { value: new Vector2() },
      uFog: { value: fogLinear() },
      uFogDensity: { value: 0.042 },
      uLampHeight: { value: LAMP_HEIGHT },
      uLampZ: { value: LAMP_Z },
      uWallTop: { value: WALL_TOP },
      uFocus: { value: new Vector3(1e6, 0, 0) },
      uFocusAmount: { value: 0 },
      uGuide: { value: GUIDE_LIGHTS },
      uTargetBook: { value: new Vector3(1e6, 0, 0) },
      uTargetColour: { value: new Vector3(0.72, 0.29, 0.2) },
      uHideTarget: { value: 0 },
    },
    vertexShader: common + vert,
    fragmentShader: common + frag,
  });
}

/** three stores colours linear; the shaders apply their own gamma, so fog matches the page's CSS background. */
function fogLinear() {
  return new Vector3(FOG.r, FOG.g, FOG.b);
}

export function lampMaterial() {
  return new ShaderMaterial({
    uniforms: { uFog: { value: fogLinear() }, uFogDensity: { value: 0.042 }, uGuide: { value: GUIDE_LIGHTS } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uFogDensity; uniform vec4 uGuide[6];
      varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld;
      void main() {
        float facing = max(dot(normalize(vNormal), vView), 0.0);
        vec3 col = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.96, 0.86), pow(facing, 0.6));
        for (int i = 0; i < 6; i++) if (distance(vWorld, uGuide[i].xyz) < 0.6) col *= 1.0 + 0.6 * uGuide[i].w;
        float dist = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.55));
        col = mix(col, uFog, clamp(fog, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
      }`,
  });
}

/** Halo sprites. Size is capped and brightness tone-mapped so they never blow out up close. */
export function glowMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uScale: { value: 900 } },
    vertexShader: /* glsl */ `
      uniform float uScale; varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_PointSize = min(uScale / vDepth, 220.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vDepth;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-r * r * 5.0) * 0.26 * smoothstep(0.8, 3.5, vDepth) * exp(-vDepth * 0.035);
        vec3 c = vec3(1.0, 0.66, 0.34) * a;
        gl_FragColor = vec4(c / (1.0 + c), 1.0);
      }`,
  });
}
