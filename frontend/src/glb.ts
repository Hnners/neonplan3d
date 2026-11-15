// Reads a glTF model (.glb, or .gltf with its data inside) into plain triangles, for the user's own furniture models
// (my-models.ts). Small on purpose: it runs in the editor bundle, which has no three.js. Positions are taken in the
// model's own units with every node's transform applied; textures, normals and animations are not needed.

/** One mesh of the model, already in place: corners (x, y, z, y up) and triangles, its name and colour. */
export interface GltfMesh {
  name: string;
  material: string;
  /** "#rrggbb" from the material's base colour, null without one. */
  color: string | null;
  positions: Float32Array;
  indices: Uint32Array;
}

export class GltfError extends Error {
  readonly code: "not_gltf" | "compressed" | "external" | "empty";

  constructor(code: GltfError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

type Json = Record<string, any>;
type Mat = number[];

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function nodeMatrix(node: Json): Mat {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  // column-major, rotation from the quaternion, then scaled per axis
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
    2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function decodeUri(uri: string): Uint8Array {
  const m = /^data:[^,]*;base64,(.*)$/.exec(uri);
  if (!m) throw new GltfError("external", "The model refers to other files: export it as a single .glb");
  const s = atob(m[1]);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Reads an accessor into numbers (normalised integers as fractions, as the format says). */
function readAccessor(gltf: Json, buffers: Uint8Array[], index: number): Float64Array {
  const acc = gltf.accessors?.[index];
  if (!acc) throw new GltfError("not_gltf", "A mesh refers to data that is missing");
  if (acc.sparse) throw new GltfError("compressed", "Sparse accessors are not supported");
  const n = COMPONENTS[acc.type] ?? 1;
  const out = new Float64Array(acc.count * n);
  if (acc.bufferView === undefined) return out;
  const view = gltf.bufferViews[acc.bufferView];
  const buf = buffers[view.buffer];
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType as number] ?? 4;
  const stride = view.byteStride || size * n;
  const dv = new DataView(buf.buffer, buf.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0));
  const norm = !!acc.normalized;
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = i * stride + c * size;
      let x: number;
      switch (acc.componentType) {
        case 5126: x = dv.getFloat32(o, true); break;
        case 5125: x = dv.getUint32(o, true); break;
        case 5123: x = dv.getUint16(o, true); if (norm) x /= 65535; break;
        case 5122: x = dv.getInt16(o, true); if (norm) x = Math.max(x / 32767, -1); break;
        case 5121: x = dv.getUint8(o); if (norm) x /= 255; break;
        default: x = dv.getInt8(o); if (norm) x = Math.max(x / 127, -1);
      }
      out[i * n + c] = x;
    }
  }
  return out;
}

/** The material's base colour as "#rrggbb" (glTF keeps it linear; the screen wants sRGB). */
function materialColor(mat: Json | undefined): string | null {
  const f = mat?.pbrMetallicRoughness?.baseColorFactor;
  if (!Array.isArray(f)) return null;
  const srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return "#" + f.slice(0, 3).map((c: number) => Math.round(Math.min(1, Math.max(0, srgb(c))) * 255).toString(16).padStart(2, "0")).join("");
}

/** Splits a .glb file into its JSON and binary chunk, or reads a .gltf file's JSON. */
function container(data: ArrayBuffer): { gltf: Json; bin: Uint8Array | null } {
  const dv = new DataView(data);
  if (data.byteLength >= 12 && dv.getUint32(0, true) === 0x46546c67) {
    let json: Json | null = null;
    let bin: Uint8Array | null = null;
    for (let o = 12; o + 8 <= data.byteLength; ) {
      const len = dv.getUint32(o, true);
      const type = dv.getUint32(o + 4, true);
      const chunk = new Uint8Array(data, o + 8, len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942) bin = chunk;
      o += 8 + len;
    }
    if (!json) throw new GltfError("not_gltf", "The file has no glTF data");
    return { gltf: json, bin };
  }
  try {
    return { gltf: JSON.parse(new TextDecoder().decode(new Uint8Array(data))), bin: null };
  } catch {
    throw new GltfError("not_gltf", "This is not a glTF model (.glb or .gltf)");
  }
}

/** Every mesh of the model's scene, with its node's transform applied, one entry per node and material. */
export function readGltf(data: ArrayBuffer): GltfMesh[] {
  const { gltf, bin } = container(data);
  const used = [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])];
  if (used.some((e: string) => /draco|meshopt|quantization/i.test(e))) {
    throw new GltfError("compressed", "The model is compressed (Draco or meshopt): export it without compression");
  }
  const buffers: Uint8Array[] = (gltf.buffers ?? []).map((b: Json, i: number) => (b.uri === undefined ? (i === 0 && bin ? bin : new Uint8Array(0)) : decodeUri(b.uri)));
  const out: GltfMesh[] = [];
  const visit = (index: number, parent: Mat) => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const m = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      const byMaterial = new Map<number, { pos: number[]; idx: number[] }>();
      for (const prim of mesh.primitives ?? []) {
        if ((prim.mode ?? 4) !== 4 || prim.attributes?.POSITION === undefined) continue;
        const raw = readAccessor(gltf, buffers, prim.attributes.POSITION);
        const idx = prim.indices !== undefined ? readAccessor(gltf, buffers, prim.indices) : Float64Array.from({ length: raw.length / 3 }, (_, i) => i);
        const mat = prim.material ?? -1;
        const into = byMaterial.get(mat) ?? { pos: [], idx: [] };
        byMaterial.set(mat, into);
        const base = into.pos.length / 3;
        for (let i = 0; i < raw.length; i += 3) {
          const [x, y, z] = [raw[i], raw[i + 1], raw[i + 2]];
          into.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
        // a mirroring transform turns the faces inside out: turn them back
        const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
        for (let i = 0; i + 2 < idx.length; i += 3) {
          if (det < 0) into.idx.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
          else into.idx.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
        }
      }
      const name = String(node.name || mesh.name || `Part ${out.length + 1}`);
      for (const [mat, g] of byMaterial) {
        if (!g.idx.length) continue;
        const material = gltf.materials?.[mat];
        out.push({
          name: byMaterial.size > 1 ? `${name} · ${material?.name ?? mat}` : name,
          material: String(material?.name ?? "default"),
          color: materialColor(material),
          positions: Float32Array.from(g.pos),
          indices: Uint32Array.from(g.idx),
        });
      }
    }
    for (const child of node.children ?? []) visit(child, m);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots: number[] = scene?.nodes ?? (gltf.nodes ?? []).map((_: Json, i: number) => i);
  for (const r of roots) visit(r, IDENTITY);
  if (!out.length) throw new GltfError("empty", "The model has no triangles");
  return out;
}
