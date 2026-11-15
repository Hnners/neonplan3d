import assert from "node:assert/strict";
import { test } from "node:test";
import { footprint, snapFurnitureEdges } from "./snap.ts";

const item = (x: number, z: number, w: number, d: number, rotation = 0) => ({ x, z, w, d, rotation });
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("an odd-sized item lands with an edge on the grid, not only its centre", () => {
  // 0.891 m wide: with its centre on the 5 cm grid neither edge would be
  const s = snapFurnitureEdges(item(1.02, 2.01, 0.891, 0.372), [], 0.05, 0.1);
  const box = footprint({ ...item(s.x, s.z, 0.891, 0.372) });
  const onGrid = (v: number) => near(Math.round(v / 0.05) * 0.05, v);
  assert.ok(onGrid(box.x0) || onGrid(box.x1) || onGrid(s.x));
  assert.ok(onGrid(box.z0) || onGrid(box.z1) || onGrid(s.z));
  assert.ok(Math.abs(s.x - 1.02) <= 0.025 + 1e-9 && Math.abs(s.z - 2.01) <= 0.025 + 1e-9, "it moves at most half a grid step");
});

test("a turned item uses its turned size", () => {
  const box = footprint(item(0, 0, 0.891, 0.372, 270));
  assert.ok(near(box.x1 - box.x0, 0.372) && near(box.z1 - box.z0, 0.891));
});

test("an item next to another sits flush with it, and the line shows", () => {
  // a bookcase at x 0.4 (0.372 deep along x when turned): a second one dragged close beside it along z
  const a = item(0.4, -6.14, 0.891, 0.372, 270);
  const s = snapFurnitureEdges(item(0.43, -5.27, 0.891, 0.372, 270), [a], 0.05, 0.1);
  // flush end to end: the second's low z edge on the first's high z edge
  assert.ok(near(s.z - 0.891 / 2, -6.14 + 0.891 / 2));
  assert.ok(s.aligned.z !== null);
  // and in line along x (same depth)
  assert.ok(near(s.x, 0.4));
});

test("far from other furniture only the grid counts", () => {
  const s = snapFurnitureEdges(item(3, 3, 1, 1), [item(0, 0, 1, 1)], 0.05, 0.1);
  assert.equal(s.aligned.x, null);
  assert.equal(s.aligned.z, null);
});
