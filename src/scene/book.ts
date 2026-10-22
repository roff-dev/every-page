import {
  BoxGeometry, DoubleSide, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry,
  Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { BOOK_DEPTH } from './dimensions';

const HEIGHT = 0.47;
const THICK = 0.135;
const DEPTH = BOOK_DEPTH;
const BOARD = 0.008;
const PAGES = 6;

/** Linear-light versions of the palette, matching the scene's own gamma handling. */
const lin = (hex: number) => {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => Math.pow(v / 255, 2.2));
  return { r: c[0]!, g: c[1]!, b: c[2]! };
};
const toSrgb = (c: { r: number; g: number; b: number }) =>
  `vec3(${[c.r, c.g, c.b].map((v) => Math.pow(v, 1 / 2.2).toFixed(4)).join(', ')})`;

/** Flat, softly shaded material for the reading book, lit like the room's lamps. */
function bookMaterial(colour: { r: number; g: number; b: number }, side = DoubleSide) {
  return new ShaderMaterial({
    side,
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float lit = 0.62 + 0.38 * max(dot(n, normalize(vView + vec3(0.2, 0.6, 0.0))), 0.0);
        gl_FragColor = vec4(${toSrgb(colour)} * lit, 1.0);
      }`,
  });
}

/** A page plane that bends as it turns: angle about the spine plus a sine curl along its width. */
function pageMaterial() {
  const paper = lin(0xf6ead0);
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uAngle: { value: 0 }, uCurl: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uAngle; uniform float uCurl;
      varying float vShade;
      void main() {
        vec3 p = position;
        // distance from the spine, which runs along the page's z = 0 edge
        float d = -p.z;
        float a = uAngle + uCurl * sin(3.14159 * d / ${(DEPTH - 0.01).toFixed(4)}) * 0.55;
        p.x = -d * sin(a);
        p.z = -d * cos(a);
        vShade = 0.82 + 0.18 * abs(cos(a));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vShade;
      void main() { gl_FragColor = vec4(${toSrgb(paper)} * vShade, 1.0); }`,
  });
}

/**
 * The volume a search leads to, as a real object: it replaces the instanced book on the shelf,
 * slides out, lifts to the reader and opens. Local frame matches the shelf slot:
 * x across the book's thickness (the front board on +x), y up, z towards the spine.
 */
export class ReadingBook {
  readonly group = new Group();
  private readonly cover = new Group();
  private readonly pages: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  private readonly shelfPosition = new Vector3();
  private readonly shelfQuaternion = new Quaternion();
  private readonly inward = new Vector3();

  constructor(slotWorld: Matrix4, inward: Vector3, colour: readonly [number, number, number]) {
    const rust = { r: colour[0], g: colour[1], b: colour[2] };
    const coverMat = bookMaterial(rust);
    const bandMat = bookMaterial(lin(0xffc46b));
    const paperMat = bookMaterial(lin(0xefe0c0));
    // the pivot sits at the book's centre so turning it to face the reader looks natural
    const body = new Group();
    body.position.set(0, -HEIGHT / 2, 0);
    const box = (sx: number, sy: number, sz: number, m: ShaderMaterial, x: number, y: number, z: number) => {
      const mesh = new Mesh(new BoxGeometry(sx, sy, sz), m);
      mesh.position.set(x, y, z);
      return mesh;
    };
    body.add(box(BOARD, HEIGHT, DEPTH, coverMat, -THICK / 2 + BOARD / 2, HEIGHT / 2, 0)); // back board
    body.add(box(THICK, HEIGHT, BOARD * 1.5, coverMat, 0, HEIGHT / 2, DEPTH / 2)); // spine
    for (const y of [0.12, 0.85]) body.add(box(THICK + 0.002, 0.018, BOARD * 1.5 + 0.002, bandMat, 0, HEIGHT * y, DEPTH / 2));
    body.add(box(THICK - 2 * BOARD - 0.004, HEIGHT - 0.016, DEPTH - 0.012, paperMat, 0, HEIGHT / 2, -0.004));
    // front board hinges at the spine edge
    this.cover.position.set(THICK / 2 - BOARD / 2, HEIGHT / 2, DEPTH / 2);
    this.cover.add(box(BOARD, HEIGHT, DEPTH, coverMat, 0, 0, -DEPTH / 2));
    body.add(this.cover);
    for (let i = 0; i < PAGES; i++) {
      const g = new PlaneGeometry(DEPTH - 0.01, HEIGHT - 0.02, 24, 1);
      g.rotateY(Math.PI / 2);
      g.translate(0, 0, -(DEPTH - 0.01) / 2);
      const page = new Mesh(g, pageMaterial());
      page.position.set(THICK / 2 - BOARD - 0.003 - i * 0.0006, HEIGHT / 2, DEPTH / 2 - 0.004);
      page.visible = false;
      body.add(page);
      this.pages.push(page);
    }
    this.group.add(body);

    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    slotWorld.decompose(p, q, s);
    this.shelfPosition.copy(p).setY(p.y + HEIGHT / 2);
    this.shelfQuaternion.copy(q);
    this.inward.copy(inward);
    this.group.position.copy(this.shelfPosition);
    this.group.quaternion.copy(this.shelfQuaternion);
  }

  /** How far in front of the camera to hold the book so it fits the screen once open. */
  static readingDistance(camera: PerspectiveCamera) {
    const vfov = MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fitHeight = HEIGHT / 0.6 / (2 * Math.tan(vfov / 2));
    const fitWidth = (2 * DEPTH) / 0.8 / (2 * Math.tan(hfov / 2));
    return Math.max(fitHeight, fitWidth);
  }

  /** 0 → on the shelf; 1 → held open-ready in front of the camera, front board facing it. */
  pull(k: number, camera: PerspectiveCamera) {
    const slide = smooth(k / 0.45);
    const lift = smooth((k - 0.35) / 0.65);
    const out = this.shelfPosition.clone().addScaledVector(this.inward, 0.24 * slide);
    const right = new Vector3();
    const up = new Vector3();
    const back = new Vector3();
    camera.matrixWorld.extractBasis(right, up, back);
    // held square to the camera; shifted right by one cover so the open spread sits centred
    const held = camera.position.clone().addScaledVector(back, -ReadingBook.readingDistance(camera)).addScaledVector(right, DEPTH / 2);
    this.group.position.lerpVectors(out, held, lift);
    // front board (+x) towards the camera, spine (+z) on the reader's left
    const face = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(back, up, right.clone().negate()));
    this.group.quaternion.slerpQuaternions(this.shelfQuaternion, face, lift);
  }

  /** 0 → closed; 1 → cover open and the pages riffled past. */
  open(k: number, riffle = true) {
    this.cover.rotation.y = -Math.PI * 0.97 * smooth(k / 0.4);
    this.pages.forEach((page, i) => {
      page.visible = riffle && k > 0.3 && k < 1;
      const pk = MathUtils.clamp((k - 0.4 - i * 0.07) / 0.3, 0, 1);
      page.material.uniforms.uAngle!.value = -Math.PI * 0.95 * smooth(pk);
      page.material.uniforms.uCurl!.value = Math.sin(Math.PI * pk);
    });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as ShaderMaterial | MeshBasicMaterial).dispose();
      }
    });
  }
}

function smooth(x: number) {
  const t = MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
