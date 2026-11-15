// The triangles of a mesh part (a part of one of the user's own models, see my-models.ts), unpacked once and kept.
// The 3D bundle draws them; the editor packs them when a model is uploaded.

import type { PackMesh } from "./packs.ts";

/** A mesh part unpacked: corners as fractions 0 … 1 of the part's box, triangles, and the edges worth a line. */
export interface UnpackedMesh {
  /** x, y, z of every corner, each 0 … 1 across the part's box. */
  v: Float32Array;
  /** Three corner numbers per triangle. */
  t: Uint32Array;
  /** Pairs of corner numbers: the creases and open borders of the surface (drawn as the part's edges). */
  edges: Uint32Array;
}

const cache = new WeakMap<PackMesh, UnpackedMesh>();

function bytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function base64(data: Uint8Array): string {
  let s = "";
  // in slices: String.fromCharCode takes only so many arguments
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Packs corners (fractions 0 … 1 of the part's box) and triangles the way PackMesh keeps them. */
export function packMesh(v: ArrayLike<number>, t: ArrayLike<number>): PackMesh {
  const q = new Uint16Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.round(Math.min(1, Math.max(0, v[i])) * 65535);
  const big = v.length / 3 > 65535;
  const tri = big ? Uint32Array.from(t) : Uint16Array.from(t);
  const out: PackMesh = { v: base64(new Uint8Array(q.buffer)), t: base64(new Uint8Array(tri.buffer)) };
  if (big) out.big = true;
  return out;
}

/** The corners and triangles of a mesh part, unpacked on first use. */
export function unpackMesh(mesh: PackMesh): UnpackedMesh {
  const hit = cache.get(mesh);
  if (hit) return hit;
  const vb = bytes(mesh.v);
  const tb = bytes(mesh.t);
  const q = new Uint16Array(vb.buffer, vb.byteOffset, Math.floor(vb.length / 2));
  const v = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) v[i] = q[i] / 65535;
  const t = mesh.big ? new Uint32Array(tb.buffer, tb.byteOffset, Math.floor(tb.length / 4)) : Uint32Array.from(new Uint16Array(tb.buffer, tb.byteOffset, Math.floor(tb.length / 2)));
  const out = { v, t, edges: creases(v, t) };
  cache.set(mesh, out);
  return out;
}

/** The cosine of the angle between two faces above which their shared edge is no crease (about 35°). */
const FLAT = Math.cos((35 * Math.PI) / 180);
/** At most this many lines per part: a very fine model would turn into a scribble otherwise. */
const MAX_EDGES = 6000;

/**
 * The edges of a surface worth a line: where two faces meet at a sharp angle, and where the surface ends. Corners at
 * the same place count as one (a model often splits its corners along seams).
 */
function creases(v: Float32Array, t: Uint32Array): Uint32Array {
  const key = (i: number) => `${Math.round(v[i * 3] * 4096)},${Math.round(v[i * 3 + 1] * 4096)},${Math.round(v[i * 3 + 2] * 4096)}`;
  const welded = new Map<string, number>();
  const same = new Uint32Array(v.length / 3);
  for (let i = 0; i < same.length; i++) {
    const k = key(i);
    const w = welded.get(k);
    if (w === undefined) welded.set(k, i);
    same[i] = w ?? i;
  }
  const normals: number[] = [];
  for (let f = 0; f < t.length; f += 3) {
    const [a, b, c] = [t[f] * 3, t[f + 1] * 3, t[f + 2] * 3];
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / l, ny / l, nz / l);
  }
  const first = new Map<string, number>();
  const out: number[] = [];
  const seen = new Set<string>();
  for (let f = 0; f < t.length / 3; f++) {
    for (let e = 0; e < 3; e++) {
      const a = same[t[f * 3 + e]];
      const b = same[t[f * 3 + ((e + 1) % 3)]];
      if (a === b) continue;
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      const g = first.get(k);
      if (g === undefined) {
        first.set(k, f);
        continue;
      }
      seen.add(k);
      const dot = normals[f * 3] * normals[g * 3] + normals[f * 3 + 1] * normals[g * 3 + 1] + normals[f * 3 + 2] * normals[g * 3 + 2];
      if (dot < FLAT && out.length < MAX_EDGES * 2) out.push(a, b);
    }
  }
  // the open borders: edges only one face has
  for (const k of first.keys()) {
    if (seen.has(k) || out.length >= MAX_EDGES * 2) continue;
    const [a, b] = k.split(":").map(Number);
    out.push(a, b);
  }
  return Uint32Array.from(out);
}
