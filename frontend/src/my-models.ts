// The user's own furniture models: a 3D file (glTF) turned into an item of the "My models" pack. Each mesh of the
// file becomes a mesh part filling its own box, so the item scales, turns and mounts like any pack item, and its
// parts can glow (a lamp), turn (a fan's blades) or show a picture (a TV) like the parts of pack furniture.

import type { GltfMesh } from "./glb.ts";
import { packMesh } from "./mesh-part.ts";
import type { PackItem, PackPart } from "./packs.ts";
import type { LampModel } from "./viewer/viewer3d.ts";

/** At most this many parts: meshes past it are merged by material, then the smallest into one. */
export const MAX_PARTS = 60;
/** More triangles than this are refused (the model would be too heavy for a wall tablet). */
export const MAX_TRIANGLES = 120_000;
/** From this many triangles on, the editor warns that old tablets may slow down. */
export const HEAVY_TRIANGLES = 25_000;

/** What a model stands for in the plan, and so which entities it takes and how it shows them. */
export type WorksAs = "furniture" | "appliance" | "lamp" | "fan" | "screen" | "sensor";

export const WORKS_AS: WorksAs[] = ["furniture", "appliance", "lamp", "fan", "screen", "sensor"];

/** The light styles a lamp model can have (LampModel without the fan, which is its own choice). */
export const LAMP_STYLES: LampModel[] = ["ceiling", "pendant", "downlight", "spot", "panel", "floor", "uplight", "table", "wall", "strip", "garden", "bollard"];

/** What an item works as, read back from the item. */
export function worksAs(item: PackItem): WorksAs {
  if (item.light === "fan") return "fan";
  if (item.light) return "lamp";
  if (item.parts.some((p) => p.screen)) return "screen";
  if (item.family === "sensor") return "sensor";
  if (item.electric) return "appliance";
  return "furniture";
}

/**
 * The item set up to work as `as`: a lamp gets a light style, a fan the fan light, a sensor its family, an appliance
 * a switch. The parts that glow, turn or show a picture are chosen per part (and only count for what fits).
 */
export function setWorksAs(item: PackItem, as: WorksAs, lamp: LampModel = "ceiling"): PackItem {
  const out: PackItem = { ...item };
  delete out.light;
  delete out.electric;
  if (out.family === "sensor") delete out.family;
  if (as === "lamp") out.light = lamp === "fan" ? "ceiling" : lamp;
  if (as === "fan") out.light = "fan";
  if (as === "appliance" || as === "screen") out.electric = true;
  if (as === "sensor") out.family = "sensor";
  return out;
}

/** Problems with what a model works as, to show next to the choice (empty when it is complete). */
export function worksAsProblems(item: PackItem): ("no_glow" | "no_spin" | "no_screen")[] {
  const as = worksAs(item);
  if (as === "lamp" && !item.parts.some((p) => p.glow)) return ["no_glow"];
  if (as === "fan" && !item.parts.some((p) => p.spin)) return ["no_spin"];
  if (as === "screen" && !item.parts.some((p) => p.screen)) return ["no_screen"];
  return [];
}

/** A short id for a new model from its name (letters, digits, "_"), unique among `taken`. */
export function modelId(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "model";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

/**
 * The scale from the file's units to metres: glTF is in metres, but files exported from CAD often keep millimetres
 * or centimetres, which make a chair dozens of metres tall.
 */
export function guessScale(largest: number): number {
  if (largest > 200) return 0.001;
  if (largest > 20) return 0.01;
  return 1;
}

/** Merges the meshes down to MAX_PARTS: first all meshes of one material, then the smallest into "Other". */
function fewer(meshes: GltfMesh[]): GltfMesh[] {
  if (meshes.length <= MAX_PARTS) return meshes;
  const join = (name: string, list: GltfMesh[]): GltfMesh => {
    const positions = new Float32Array(list.reduce((s, m) => s + m.positions.length, 0));
    const indices = new Uint32Array(list.reduce((s, m) => s + m.indices.length, 0));
    let pv = 0;
    let pi = 0;
    for (const m of list) {
      positions.set(m.positions, pv);
      for (let i = 0; i < m.indices.length; i++) indices[pi + i] = m.indices[i] + pv / 3;
      pv += m.positions.length;
      pi += m.indices.length;
    }
    return { name, material: list[0].material, color: list[0].color, positions, indices };
  };
  const byMaterial = new Map<string, GltfMesh[]>();
  for (const m of meshes) byMaterial.set(m.material, [...(byMaterial.get(m.material) ?? []), m]);
  let merged = [...byMaterial.entries()].map(([mat, list]) => (list.length === 1 ? list[0] : join(mat, list)));
  if (merged.length > MAX_PARTS) {
    merged.sort((a, b) => b.indices.length - a.indices.length);
    merged = [...merged.slice(0, MAX_PARTS - 1), join("Other", merged.slice(MAX_PARTS - 1))];
  }
  return merged;
}

export interface BuiltModel {
  item: PackItem;
  triangles: number;
  /** The scale applied to the file's units (1 when it was in metres). */
  scale: number;
}

/**
 * An item from the meshes of a glTF file: its size is the model's (in metres), each mesh a part in its own box, in
 * the mesh's own colour (or the furniture body colour), with faint edges like the other furniture.
 */
export function buildModel(meshes: GltfMesh[], name: string, id: string): BuiltModel {
  const parts = fewer(meshes);
  const triangles = parts.reduce((s, m) => s + m.indices.length / 3, 0);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of parts) {
    for (let i = 0; i < m.positions.length; i++) {
      lo[i % 3] = Math.min(lo[i % 3], m.positions[i]);
      hi[i % 3] = Math.max(hi[i % 3], m.positions[i]);
    }
  }
  const ext = hi.map((h, a) => Math.max(h - lo[a], 1e-6));
  const scale = guessScale(Math.max(...ext));
  // the item's size: width along x, depth along z, height along y (glTF is y-up, its front looks along +z like ours)
  const size: [number, number, number] = [ext[0] * scale, ext[2] * scale, ext[1] * scale].map((v) => Math.max(0.01, Math.round(v * 1000) / 1000)) as [number, number, number];
  const out: PackPart[] = parts.map((m) => {
    const plo = [Infinity, Infinity, Infinity];
    const phi = [-Infinity, -Infinity, -Infinity];
    // only the corners the triangles use, numbered anew
    const used = new Map<number, number>();
    for (const i of m.indices) if (!used.has(i)) used.set(i, used.size);
    for (const i of used.keys()) {
      for (let a = 0; a < 3; a++) {
        plo[a] = Math.min(plo[a], m.positions[i * 3 + a]);
        phi[a] = Math.max(phi[a], m.positions[i * 3 + a]);
      }
    }
    const span = phi.map((h, a) => h - plo[a]);
    const v = new Float32Array(used.size * 3);
    for (const [i, n] of used) for (let a = 0; a < 3; a++) v[n * 3 + a] = span[a] > 1e-9 ? (m.positions[i * 3 + a] - plo[a]) / span[a] : 0.5;
    const t = Uint32Array.from(m.indices, (i) => used.get(i)!);
    const frac = (a: number) => [(plo[a] + phi[a]) / 2 - lo[a], span[a]].map((x) => x / ext[a]);
    const [cx, w] = frac(0);
    const [cz, d] = frac(2);
    const round = (x: number) => Math.round(x * 1e5) / 1e5;
    return {
      shape: "mesh",
      name: m.name.slice(0, 80),
      x: round(cx - 0.5),
      z: round(cz - 0.5),
      w: round(Math.max(w, 1e-4)),
      d: round(Math.max(d, 1e-4)),
      y: round((plo[1] - lo[1]) / ext[1]),
      h: round(Math.max(span[1] / ext[1], 1e-4)),
      color: m.color ?? "body",
      edges: "faint",
      mesh: packMesh(v, t),
    } satisfies PackPart;
  });
  const item: PackItem = {
    id,
    name: { en: name.slice(0, 80) },
    size,
    parts: out,
    // the plan shows the model's outline from above
    symbol: [{ shape: "rect", x: 0, z: 0, w: 1, d: 1 }],
  };
  return { item, triangles, scale };
}
