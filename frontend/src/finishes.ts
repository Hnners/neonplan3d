/**
 * Finishes: a placed item's own wood, fabric and front colour in the homely styles (the neon looks draw every
 * item in their own colours). They replace the palette roles an item is built from ("wood", "fabric" and
 * "cushion", "white"), so they work for the built-in furniture and for every pack item alike. Pure data, shared
 * by the editor (swatches) and the 3D bundle (colours).
 */
import type { Furniture } from "./model.ts";
import type { PackItem } from "./packs.ts";

export type FinishRole = "wood" | "fabric" | "front" | "body";
export const FINISH_ROLES: readonly FinishRole[] = ["wood", "fabric", "front", "body"];

/** The swatches of each role: a short id and its colour. */
export const FINISH_SWATCHES: Record<FinishRole, readonly { id: string; hex: string }[]> = {
  wood: [
    { id: "oak_light", hex: "#c9a375" },
    { id: "oak", hex: "#a67a52" },
    { id: "walnut", hex: "#6b4a32" },
    { id: "white", hex: "#ece8e1" },
    { id: "grey", hex: "#8c8f94" },
    { id: "black", hex: "#2e2e31" },
  ],
  fabric: [
    { id: "grey", hex: "#8e97a5" },
    { id: "anthracite", hex: "#4a4f58" },
    { id: "beige", hex: "#cbb89a" },
    { id: "blue", hex: "#4a6a9a" },
    { id: "green", hex: "#5d7d5a" },
    { id: "rust", hex: "#a5583a" },
    { id: "mustard", hex: "#c9a03a" },
    { id: "rose", hex: "#c99aa0" },
  ],
  // the body: a pack item's own main colour (leather, a lacquer, an uploaded model's main colour)
  body: [
    { id: "tan", hex: "#a8703f" },
    { id: "cognac", hex: "#8a4b26" },
    { id: "brown", hex: "#4a2f24" },
    { id: "oxblood", hex: "#5e1f22" },
    { id: "black", hex: "#262528" },
    { id: "grey", hex: "#7d8288" },
    { id: "cream", hex: "#e3d6bd" },
    { id: "navy", hex: "#2e3c5a" },
  ],
  front: [
    { id: "white", hex: "#edebe7" },
    { id: "cream", hex: "#e9dfc8" },
    { id: "grey", hex: "#9ea3a8" },
    { id: "sage", hex: "#9fae96" },
    { id: "blue", hex: "#5d7590" },
    { id: "black", hex: "#34363a" },
  ],
};

/** Built-in furniture and the roles it is drawn with (read from its builder; devices keep their own colours). */
const BUILTIN: Record<string, readonly FinishRole[]> = {
  sofa: ["fabric", "wood"],
  sofa_l: ["fabric", "wood"],
  sofa_u: ["fabric", "wood"],
  armchair: ["fabric", "wood"],
  bed: ["fabric", "wood", "front"],
  bunk_bed: ["wood", "front"],
  chair: ["fabric", "wood"],
  bench: ["fabric", "wood"],
  corner_bench: ["fabric", "wood"],
  stool: ["fabric", "wood"],
  bar_stool: ["fabric"],
  office_chair: ["fabric"],
  rug: ["fabric"],
  table: ["wood"],
  table_round: ["wood"],
  coffee_table: ["wood"],
  desk: ["wood"],
  shelf: ["wood"],
  sideboard: ["wood"],
  dresser: ["wood"],
  coat_rack: ["wood"],
  stairs: ["wood"],
  stairs_u: ["wood"],
};

/** The roles an item can take a finish for (empty: none, e.g. a device). */
export function finishRolesOf(type: string, pack: PackItem | null): FinishRole[] {
  if (!pack) return [...(BUILTIN[type] ?? [])];
  const used = new Set(pack.parts.flatMap((p) => [p.color, p.top]));
  const out: FinishRole[] = [];
  if (used.has("wood")) out.push("wood");
  if (used.has("fabric") || used.has("cushion")) out.push("fabric");
  if (used.has("white")) out.push("front");
  if (bodyHex(pack)) out.push("body");
  return out;
}

/**
 * A pack item's own main colour: the fixed "#rrggbb" most of its parts have (a leather sofa's leather), or null
 * when its parts take the palette's roles only. The body finish replaces this colour.
 */
export function bodyHex(pack: PackItem): string | null {
  const count = new Map<string, number>();
  for (const p of pack.parts) {
    if (p.glow || p.screen || !p.color?.startsWith("#")) continue;
    const c = p.color.toLowerCase();
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of count) if (k > n) [best, n] = [c, k];
  return best;
}

/** Whether an item's fabric role only colours cushions (a leather sofa): its label then says so. */
export function fabricIsCushions(pack: PackItem | null): boolean {
  if (!pack) return false;
  const used = new Set(pack.parts.flatMap((p) => [p.color, p.top]));
  return used.has("cushion") && !used.has("fabric");
}

/** The colour a placed item takes for a role, or null for the look's own. */
export function finishHex(f: Pick<Furniture, "finish">, role: FinishRole): string | null {
  const h = f.finish?.[role];
  return typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h) ? h : null;
}
