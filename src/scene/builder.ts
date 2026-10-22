import { BufferGeometry, Float32BufferAttribute, Matrix3, Matrix4, Vector3 } from 'three';

export type Rgb = readonly [number, number, number];

/** Surface kinds the shader treats specially. */
export const enum Surface {
  Plain = 0,
  BookStrip = 1,
  Mirror = 2,
}

/**
 * Accumulates flat-shaded or smooth triangles with per-vertex colour and a `detail` attribute
 * (x, y: surface coordinates, z: surface kind), and merges everything into one geometry.
 */
export class Builder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private d: number[] = [];

  private push(v: Vector3, normal: Vector3, col: Rgb, detail: readonly [number, number, number]) {
    this.p.push(v.x, v.y, v.z);
    this.n.push(normal.x, normal.y, normal.z);
    this.c.push(col[0], col[1], col[2]);
    this.d.push(detail[0], detail[1], detail[2]);
  }

  tri(a: Vector3, b: Vector3, c: Vector3, col: Rgb, detail: readonly (readonly [number, number, number])[] = ZERO3) {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    this.push(a, n, col, detail[0]!);
    this.push(b, n, col, detail[1]!);
    this.push(c, n, col, detail[2]!);
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Rgb, detail?: readonly (readonly [number, number, number])[]) {
    this.tri(a, b, c, col, detail ? [detail[0]!, detail[1]!, detail[2]!] : ZERO3);
    this.tri(a, c, d, col, detail ? [detail[0]!, detail[2]!, detail[3]!] : ZERO3);
  }

  /** Box with chamfered edges in a local frame; `bevel` in metres. */
  box(o: Vector3, ux: Vector3, uy: Vector3, uz: Vector3, sx: number, sy: number, sz: number, col: Rgb, bevel = 0) {
    const g = roundedBoxPositions(sx, sy, sz, bevel);
    const m = new Matrix4().makeBasis(ux, uy, uz).setPosition(o);
    this.addGeometry(g, m, col);
  }

  /** Merge any three geometry (indexed or not) with a transform and a flat colour. */
  addGeometry(geometry: BufferGeometry, matrix: Matrix4, col: Rgb, kind = Surface.Plain) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const nm = new Matrix3().getNormalMatrix(matrix);
    const v = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      this.push(v, n, col, [uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, kind]);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    g.setAttribute('detail', new Float32BufferAttribute(this.d, 3));
    return g;
  }
}

const ZERO3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]] as const;

/** A chamfered box: eight corner points per face pulled in by the bevel, plus the bevel strips. */
function roundedBoxPositions(sx: number, sy: number, sz: number, bevel: number): BufferGeometry {
  const b = Math.min(bevel, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const tris: number[] = [];
  const norms: number[] = [];
  const quad = (a: number[], bb: number[], c: number[], d: number[]) => {
    const A = new Vector3(...(a as [number, number, number]));
    const B = new Vector3(...(bb as [number, number, number]));
    const C = new Vector3(...(c as [number, number, number]));
    const D = new Vector3(...(d as [number, number, number]));
    const n = new Vector3().subVectors(B, A).cross(new Vector3().subVectors(C, A)).normalize();
    // the box is convex and centred, so a face must point away from the centre
    const centroid = new Vector3().add(A).add(B).add(C).add(D);
    const order = n.dot(centroid) >= 0 ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
    if (n.dot(centroid) < 0) n.negate();
    for (const p of order) { tris.push(p.x, p.y, p.z); norms.push(n.x, n.y, n.z); }
  };
  // six faces, inset by the bevel
  quad([-hx + b, -hy + b, hz], [hx - b, -hy + b, hz], [hx - b, hy - b, hz], [-hx + b, hy - b, hz]);
  quad([hx - b, -hy + b, -hz], [-hx + b, -hy + b, -hz], [-hx + b, hy - b, -hz], [hx - b, hy - b, -hz]);
  quad([hx, -hy + b, hz - b], [hx, -hy + b, -hz + b], [hx, hy - b, -hz + b], [hx, hy - b, hz - b]);
  quad([-hx, -hy + b, -hz + b], [-hx, -hy + b, hz - b], [-hx, hy - b, hz - b], [-hx, hy - b, -hz + b]);
  quad([-hx + b, hy, hz - b], [hx - b, hy, hz - b], [hx - b, hy, -hz + b], [-hx + b, hy, -hz + b]);
  quad([-hx + b, -hy, -hz + b], [hx - b, -hy, -hz + b], [hx - b, -hy, hz - b], [-hx + b, -hy, hz - b]);
  if (b > 0) {
    // twelve edge chamfers (orientation fixed up by quad)
    for (const sy2 of [1, -1]) for (const sz2 of [1, -1]) {
      const y0 = sy2 * hy, z0 = sz2 * hz;
      const a = [-hx + b, y0, z0 - sz2 * b], c = [-hx + b, y0 - sy2 * b, z0];
      const a2 = [hx - b, y0, z0 - sz2 * b], c2 = [hx - b, y0 - sy2 * b, z0];
      quad(a, a2, c2, c);
    }
    for (const sx2 of [1, -1]) for (const sz2 of [1, -1]) {
      const x0 = sx2 * hx, z0 = sz2 * hz;
      const a = [x0, -hy + b, z0 - sz2 * b], c = [x0 - sx2 * b, -hy + b, z0];
      const a2 = [x0, hy - b, z0 - sz2 * b], c2 = [x0 - sx2 * b, hy - b, z0];
      quad(a, a2, c2, c);
    }
    for (const sx2 of [1, -1]) for (const sy2 of [1, -1]) {
      const x0 = sx2 * hx, y0 = sy2 * hy;
      const a = [x0, y0 - sy2 * b, -hz + b], c = [x0 - sx2 * b, y0, -hz + b];
      const a2 = [x0, y0 - sy2 * b, hz - b], c2 = [x0 - sx2 * b, y0, hz - b];
      quad(a, a2, c2, c);
    }
    // eight corner triangles
    for (const sx2 of [1, -1]) for (const sy2 of [1, -1]) for (const sz2 of [1, -1]) {
      const x = new Vector3(sx2 * hx, sy2 * (hy - b), sz2 * (hz - b));
      const y = new Vector3(sx2 * (hx - b), sy2 * hy, sz2 * (hz - b));
      const z = new Vector3(sx2 * (hx - b), sy2 * (hy - b), sz2 * hz);
      const n = new Vector3().subVectors(y, x).cross(new Vector3().subVectors(z, x));
      const out = new Vector3(sx2, sy2, sz2);
      const [p, q, r] = n.dot(out) > 0 ? [x, y, z] : [x, z, y];
      const nn = new Vector3(sx2, sy2, sz2).normalize();
      for (const v of [p, q, r]) { tris.push(v.x, v.y, v.z); norms.push(nn.x, nn.y, nn.z); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris, 3));
  g.setAttribute('normal', new Float32BufferAttribute(norms, 3));
  return g;
}
