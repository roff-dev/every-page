attribute vec3 detail;

uniform vec2 uRoomOffset; // whole rooms between world origin and the library's real coordinates
uniform vec3 uTargetBook; // the slot of the book a search leads to
uniform vec3 uTargetColour;
const float TARGET_HEIGHT = 0.47;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vDetail;
varying vec3 vLocal;
varying float vTarget;

void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec3 pos = position;
  vColor = color;
  vLocal = position;
  vTarget = 0.0;

  #ifdef BOOKS
    // Every book's height and colour come from which room and slot it is in, so moving
    // the whole set of rooms by a whole room re-dresses it for free.
    vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec2 room = roomOf(origin) + uRoomOffset;
    float slot = float(gl_InstanceID - (gl_InstanceID / 640) * 640);
    float h = hash13(vec3(room, slot));
    float height = 0.40 + 0.14 * h;
    bool target = distance(origin, uTargetBook) < 0.01;
    if (target) height = TARGET_HEIGHT;
    vTarget = target ? 1.0 : 0.0;
    pos.y = (pos.y + 0.5) * height;
    pos.z *= 0.88 + 0.12 * hash13(vec3(room.yx, slot + 7.0));
    if (target) pos.z += 0.25; // stands a little proud of its neighbours
    vColor = target ? uTargetColour : spineColour(hash13(vec3(room + 0.37, slot * 1.3)));
    vLocal = vec3(position.x, pos.y / height, position.z);
  #endif

  vec4 w = m * vec4(pos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(m) * normal);
  vDetail = detail;
  gl_Position = projectionMatrix * viewMatrix * w;
}
