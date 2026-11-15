import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyHex, fabricIsCushions, finishRolesOf } from "./finishes.ts";
import type { PackItem } from "./packs.ts";

/** Like the leather armchair of the living pack: a leather body (one fixed colour), wooden feet, cushions. */
const leather: PackItem = {
  id: "armchair_leather",
  name: { en: "Leather armchair" },
  size: [0.9, 0.9, 0.8],
  parts: [
    ...[0, 1, 2, 3].map((i) => ({ shape: "box" as const, x: i / 10, z: 0, w: 0.1, d: 0.1, y: 0, h: 0.1, color: "wood" })),
    ...[0, 1, 2].map((i) => ({ shape: "box" as const, x: 0, z: i / 10, w: 1, d: 0.2, y: 0.1, h: 0.4, color: "#4A2F24" })),
    { shape: "box", x: 0, z: 0, w: 0.8, d: 0.6, y: 0.4, h: 0.1, color: "cushion" },
    { shape: "box", x: 0, z: 0, w: 0.1, d: 0.1, y: 0.7, h: 0.05, color: "#ffcc00", glow: true },
  ],
};

test("a leather item offers its upholstery and names its fabric cushions", () => {
  assert.equal(bodyHex(leather), "#4a2f24");
  assert.deepEqual(finishRolesOf(leather.id, leather), ["wood", "fabric", "body"]);
  assert.equal(fabricIsCushions(leather), true);
});

test("an item drawn in roles only has no upholstery", () => {
  const plain: PackItem = { ...leather, parts: leather.parts.filter((p) => !p.color.startsWith("#")).map((p) => ({ ...p, color: p.color === "cushion" ? "fabric" : p.color })) };
  assert.equal(bodyHex(plain), null);
  assert.deepEqual(finishRolesOf(plain.id, plain), ["wood", "fabric"]);
  assert.equal(fabricIsCushions(plain), false);
});
