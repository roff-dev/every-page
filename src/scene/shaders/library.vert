attribute vec3 detail;

uniform vec2 uRoomOffset; // whole rooms between world origin and the library's real coordinates

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vDetail;
varying vec3 vLocal;

void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec3 pos = position;
  vColor = color;
  vLocal = position;

  #ifdef BOOKS
    // Every book's height and colour come from which room and slot it is in, so moving
    // the whole set of rooms by a whole room re-dresses it for free.
    vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec2 room = roomOf(origin) + uRoomOffset;
    float slot = float(gl_InstanceID - (gl_InstanceID / 640) * 640);
    float h = hash13(vec3(room, slot));
    float height = 0.40 + 0.14 * h;
    pos.y = (pos.y + 0.5) * height;
    pos.z *= 0.88 + 0.12 * hash13(vec3(room.yx, slot + 7.0));
    vColor = spineColour(hash13(vec3(room + 0.37, slot * 1.3)));
    vLocal = vec3(position.x, pos.y / height, position.z);
  #endif

  vec4 w = m * vec4(pos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(m) * normal);
  vDetail = detail;
  gl_Position = projectionMatrix * viewMatrix * w;
}
