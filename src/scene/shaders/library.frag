uniform vec3 uFog;
uniform float uFogDensity;
uniform vec2 uRoomOffset;
uniform float uLampHeight;
uniform float uLampZ;
uniform float uWallTop;
uniform vec3 uFocus;
uniform float uFocusAmount;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vDetail;
varying vec3 vLocal;

const vec3 LAMP = vec3(1.0, 0.72, 0.42);

void main() {
  vec3 base = vColor;
  vec3 n = normalize(vNormal);

  // position within the repeating room
  vec3 l = vWorld;
  l.x -= uPitchX * floor(l.x / uPitchX + 0.5);
  l.y -= uFloorHeight * floor((l.y + 0.15) / uFloorHeight);

  int kind = int(vDetail.z + 0.5);
  if (kind == 1) {
    // distant shelves: spines painted straight onto one quad per shelf
    vec2 room = roomOf(vWorld - n * 0.02) + uRoomOffset;
    float id = floor(vDetail.x);
    float top = 0.66 + 0.25 * hash13(vec3(room, id));
    if (vDetail.y > top) {
      base = vec3(0.30, 0.17, 0.11);
    } else {
      base = spineColour(hash13(vec3(room + 0.37, id * 1.3)));
      float e = fract(vDetail.x);
      base *= 0.72 + 0.28 * smoothstep(0.0, 0.14, e) * smoothstep(1.0, 0.86, e);
    }
  }

  #ifdef BOOKS
    if (vLocal.z > 0.49) {
      // spine: two bands and a soft roll at the edges
      float y = vLocal.y;
      float band = smoothstep(0.1, 0.11, y) * smoothstep(0.15, 0.14, y) + smoothstep(0.84, 0.85, y) * smoothstep(0.89, 0.88, y);
      base = mix(base, base * 1.35 + 0.04, band * 0.8);
      base *= 0.82 + 0.18 * (1.0 - pow(abs(vLocal.x) * 2.0, 4.0));
    } else if (vLocal.y > 0.995) {
      base = mix(base, vec3(0.93, 0.86, 0.72), 0.55); // page edges on top
    }
  #endif

  // two lamps per room, hung transversally
  vec3 light = vec3(0.085, 0.055, 0.042);
  for (int i = 0; i < 2; i++) {
    vec3 lp = vec3(0.0, uLampHeight, i == 0 ? uLampZ : -uLampZ);
    vec3 d = lp - l;
    float dd = dot(d, d);
    float wrap = max(dot(n, normalize(d)) * 0.55 + 0.45, 0.0);
    light += LAMP * wrap * (5.6 / (1.0 + dd * 0.62));
  }
  // warm bounce from the floor and the shaft
  light += vec3(0.17, 0.09, 0.05) * (0.5 - 0.5 * n.y);
  // soft ambient occlusion by height: darker into the floor and the ceiling corners
  float ao = mix(0.74, 1.0, smoothstep(0.0, 0.7, l.y)) * mix(1.0, 0.82, smoothstep(uWallTop - 0.7, uWallTop, l.y));
  vec3 col = base * light * ao;

  if (kind == 2) {
    // hallway mirror: a warm, softly brightening sheen rather than a true reflection
    col = mix(vec3(0.42, 0.30, 0.22), vec3(0.95, 0.80, 0.60), smoothstep(-0.85, 0.85, vDetail.y)) * (0.75 + 0.25 * light.r);
  }

  float fd = distance(vWorld, uFocus);
  col += LAMP * uFocusAmount * exp(-fd * fd * 14.0);

  col = col / (1.0 + col * 0.32);
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.55));
  col = mix(col, uFog, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
