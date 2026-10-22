uniform float uPitchX;
uniform float uFloorHeight;

float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 spineColour(float t) {
  int i = int(floor(t * 8.0));
  if (i == 0) return vec3(0.72, 0.29, 0.20);
  if (i == 1) return vec3(0.83, 0.58, 0.25);
  if (i == 2) return vec3(0.30, 0.45, 0.42);
  if (i == 3) return vec3(0.91, 0.82, 0.64);
  if (i == 4) return vec3(0.48, 0.27, 0.38);
  if (i == 5) return vec3(0.52, 0.55, 0.28);
  if (i == 6) return vec3(0.27, 0.33, 0.50);
  return vec3(0.80, 0.45, 0.33);
}

// Whole-room coordinates of a world position (rooms repeat every pitch along x and every floor along y)
vec2 roomOf(vec3 w) {
  return vec2(floor(w.x / uPitchX + 0.5), floor((w.y + 0.15) / uFloorHeight));
}
