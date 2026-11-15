import assert from "node:assert/strict";
import { test } from "node:test";
import { readGltf } from "./glb.ts";
import { unpackMesh } from "./mesh-part.ts";
import { buildModel, modelId, setWorksAs, worksAs, worksAsProblems } from "./my-models.ts";

/** A tiny .glb: two boxes-as-triangles, one per node, with two materials, in centimetres. */
function glb(): ArrayBuffer {
  const pos = new Float32Array([0, 0, 0, 100, 0, 0, 100, 0, 50, 0, 80, 0, 0, 80, 0, 0, 80, 50, 0, 200, 50]);
  const bin = new Uint8Array(pos.byteLength + 24);
  bin.set(new Uint8Array(pos.buffer), 0);
  bin.set(new Uint8Array(new Uint16Array([0, 1, 2, 0, 1, 2, 3, 5, 6, 3, 4, 6]).buffer), pos.byteLength);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, name: "Base" }, { mesh: 1, name: "Shade" }],
    materials: [{ name: "wood", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { name: "glass" }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 0 }, indices: 2, material: 1 }] },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 7, type: "VEC3", min: [0, 0, 0], max: [100, 200, 50] },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 1, byteOffset: 12, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (b: Uint8Array, fill: number) => {
    const out = new Uint8Array(Math.ceil(b.length / 4) * 4).fill(fill);
    out.set(b);
    return out;
  };
  js = pad(js, 0x20);
  const bn = pad(bin, 0);
  const total = 12 + 8 + js.length + 8 + bn.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  dv.setUint32(20 + js.length, bn.length, true);
  dv.setUint32(24 + js.length, 0x004e4942, true);
  out.set(bn, 28 + js.length);
  return out.buffer;
}

test("a glb becomes an item in metres with one mesh part per node", () => {
  const meshes = readGltf(glb());
  assert.equal(meshes.length, 2);
  const { item, triangles, scale } = buildModel(meshes, "Lamp", "lamp");
  assert.equal(scale, 0.01);
  assert.equal(triangles, 4);
  assert.deepEqual(item.size, [1, 0.5, 2]);
  assert.equal(item.parts.length, 2);
  assert.equal(item.parts[0].name, "Base");
  assert.equal(item.parts[0].color, "#ff0000");
  for (const p of item.parts) {
    assert.equal(p.shape, "mesh");
    const m = unpackMesh(p.mesh!);
    assert.ok(m.t.length % 3 === 0 && m.t.length > 0);
    for (const v of m.v) assert.ok(v >= 0 && v <= 1);
  }
});

test("works as sets the fields and reads back", () => {
  const { item } = buildModel(readGltf(glb()), "Lamp", "lamp");
  const lamp = setWorksAs(item, "lamp", "table");
  assert.equal(worksAs(lamp), "lamp");
  assert.equal(lamp.light, "table");
  assert.deepEqual(worksAsProblems(lamp), ["no_glow"]);
  const glowing = { ...lamp, parts: lamp.parts.map((p, i) => (i ? { ...p, glow: true } : p)) };
  assert.deepEqual(worksAsProblems(glowing), []);
  assert.equal(worksAs(setWorksAs(lamp, "fan")), "fan");
  assert.equal(worksAs(setWorksAs(lamp, "sensor")).toString(), "sensor");
  assert.equal(worksAs(setWorksAs(lamp, "appliance")), "appliance");
  assert.equal(worksAs(setWorksAs(lamp, "furniture")), "furniture");
});

test("model ids are unique", () => {
  assert.equal(modelId("Big Lamp!", new Set()), "big_lamp");
  assert.equal(modelId("Big Lamp", new Set(["big_lamp"])), "big_lamp_2");
});
