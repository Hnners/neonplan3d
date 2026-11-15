// "My models" on the Extensions page: the user's own furniture from 3D files (glTF). Upload a .glb, set what it
// works as (a lamp, a fan, a TV …) and which of its parts glow, turn or show a picture, and it appears in the
// furniture library like pack furniture. Admins only, as the page is.

import { css, html, LitElement, nothing } from "lit";
import { deleteModel, saveModel } from "../api.ts";
import { GltfError, readGltf } from "../glb.ts";
import { buildModel, HEAVY_TRIANGLES, LAMP_STYLES, MAX_TRIANGLES, modelId, setWorksAs, WORKS_AS, worksAs, worksAsProblems, type WorksAs } from "../my-models.ts";
import { isLocalPack, type FurniturePack, type PackItem, type PackPart } from "../packs.ts";
import { controls, tokens } from "../styles.ts";
import type { HomeAssistant } from "../types.ts";
import type { LampModel } from "../viewer/viewer3d.ts";

const EN = {
  title: "My models",
  intro: "Your own furniture from 3D files. Upload a .glb (or a .gltf with everything inside), set what it works as and which parts glow, turn or show a picture, and it appears in the furniture library under My models.",
  none: "No models yet.",
  upload: "Upload a 3D model (.glb) …",
  reading: "Reading the model …",
  edit: "Edit",
  remove: "Remove",
  remove_confirm: "Remove “{name}”? Furniture placed from it stays in the plan but shows that its model is gone.",
  save: "Save",
  saving: "Saving …",
  cancel: "Cancel",
  saved: "Saved “{name}”. It is in the furniture library under My models.",
  name: "Name",
  width: "Width (m)",
  depth: "Depth (m)",
  height: "Height (m)",
  mount: "Placement",
  mount_floor: "On the floor",
  mount_surface: "On the furniture below",
  mount_wall: "On a wall",
  mount_ceiling: "From the ceiling",
  wall_y: "Height of its bottom on the wall (m)",
  works_as: "Works as",
  as_furniture: "Just furniture",
  as_appliance: "Appliance (switch, power)",
  as_lamp: "Lamp",
  as_fan: "Ceiling fan",
  as_screen: "TV or screen",
  as_sensor: "Sensor",
  light: "Light style",
  edges: "Edges",
  edges_none: "None",
  edges_faint: "Faint",
  edges_soft: "Soft blue",
  edges_glow: "Neon",
  parts: "Parts",
  part_color: "Colour",
  part_glow: "Glows",
  part_spin: "Turns",
  part_screen: "Screen",
  no_glow: "Tick the parts that glow (the shade or bulb), or the lamp will not light up.",
  no_spin: "Tick the parts that turn (the blades).",
  no_screen: "Tick the part that is the screen.",
  heavy: "{n} triangles: fine on a computer, but an old wall tablet may slow down. A simpler model helps.",
  too_heavy: "{n} triangles is too much (at most {max}). Simplify the model in Blender (Decimate) and upload it again.",
  scaled: "The file was not in metres; it was scaled to {size}. Check the size.",
  err_not_gltf: "This is not a glTF model. Export it as .glb.",
  err_compressed: "The model is compressed (Draco or meshopt). Export it again without compression.",
  err_external: "The model refers to other files. Export it as one .glb file.",
  err_empty: "The model has no surfaces to draw.",
  err_save: "Could not save: {detail}",
};
type Key = keyof typeof EN;
const DE: Record<Key, string> = {
  title: "Meine Modelle",
  intro: "Eigene Möbel aus 3D-Dateien. Lade eine .glb (oder eine .gltf mit allem darin) hoch, lege fest, was sie ist und welche Teile leuchten, sich drehen oder ein Bild zeigen – dann steht sie in der Möbel-Bibliothek unter Meine Modelle.",
  none: "Noch keine Modelle.",
  upload: "3D-Modell hochladen (.glb) …",
  reading: "Modell wird gelesen …",
  edit: "Bearbeiten",
  remove: "Entfernen",
  remove_confirm: "„{name}“ entfernen? Möbel daraus bleiben im Plan, zeigen aber, dass ihr Modell fehlt.",
  save: "Speichern",
  saving: "Speichert …",
  cancel: "Abbrechen",
  saved: "„{name}“ gespeichert. Es steht in der Möbel-Bibliothek unter Meine Modelle.",
  name: "Name",
  width: "Breite (m)",
  depth: "Tiefe (m)",
  height: "Höhe (m)",
  mount: "Platz",
  mount_floor: "Auf dem Boden",
  mount_surface: "Auf dem Möbel darunter",
  mount_wall: "An der Wand",
  mount_ceiling: "An der Decke",
  wall_y: "Höhe der Unterkante an der Wand (m)",
  works_as: "Ist ein(e)",
  as_furniture: "Nur Möbel",
  as_appliance: "Gerät (Schalter, Leistung)",
  as_lamp: "Lampe",
  as_fan: "Deckenventilator",
  as_screen: "Fernseher oder Bildschirm",
  as_sensor: "Sensor",
  light: "Lichtart",
  edges: "Kanten",
  edges_none: "Keine",
  edges_faint: "Zart",
  edges_soft: "Dezent blau",
  edges_glow: "Neon",
  parts: "Teile",
  part_color: "Farbe",
  part_glow: "Leuchtet",
  part_spin: "Dreht sich",
  part_screen: "Bildschirm",
  no_glow: "Hake die Teile an, die leuchten (Schirm oder Birne), sonst leuchtet die Lampe nicht.",
  no_spin: "Hake die Teile an, die sich drehen (die Flügel).",
  no_screen: "Hake das Teil an, das der Bildschirm ist.",
  heavy: "{n} Dreiecke: am Computer kein Problem, ein altes Wandtablet kann aber langsam werden. Ein einfacheres Modell hilft.",
  too_heavy: "{n} Dreiecke sind zu viele (höchstens {max}). Vereinfache das Modell in Blender (Decimate) und lade es erneut hoch.",
  scaled: "Die Datei war nicht in Metern; sie wurde auf {size} umgerechnet. Prüfe die Größe.",
  err_not_gltf: "Das ist kein glTF-Modell. Exportiere es als .glb.",
  err_compressed: "Das Modell ist komprimiert (Draco oder meshopt). Exportiere es ohne Komprimierung.",
  err_external: "Das Modell verweist auf andere Dateien. Exportiere es als eine .glb-Datei.",
  err_empty: "Das Modell hat keine Flächen.",
  err_save: "Speichern fehlgeschlagen: {detail}",
};

type Edges = "none" | "faint" | "soft" | "glow";

/** A model being edited: the item as it will be saved, whether it is new, and notes from the upload. */
interface Draft {
  item: PackItem;
  isNew: boolean;
  triangles: number;
  scaledTo: string | null;
}

export class MyModels extends LitElement {
  static properties = {
    hass: { attribute: false },
    packs: { attribute: false },
    _draft: { state: true },
    _busy: { state: true },
    _msg: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare packs: FurniturePack[] | undefined;
  private declare _draft: Draft | null;
  private declare _busy: "reading" | "saving" | null;
  private declare _msg: { ok: boolean; text: string } | null;

  constructor() {
    super();
    this._draft = null;
    this._busy = null;
    this._msg = null;
  }

  private t(key: Key, vars: Record<string, string | number> = {}): string {
    const table = (this.hass?.language ?? navigator.language).startsWith("de") ? DE : EN;
    return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  }

  private get models(): PackItem[] {
    return (this.packs ?? []).find(isLocalPack)?.items ?? [];
  }

  private name(item: PackItem): string {
    return item.name.en ?? Object.values(item.name)[0] ?? item.id;
  }

  protected render() {
    const models = this.models;
    return html`<section class="card">
      <h3>${this.t("title")}</h3>
      <p class="fp3d-sub">${this.t("intro")}</p>
      ${models.length
        ? models.map(
            (m) => html`<div class="row">
              <div>
                <b>${this.name(m)}</b>
                <span class="fp3d-sub">${m.size.map((v) => v.toFixed(2)).join(" × ")} m · ${this.t(`as_${worksAs(m)}` as Key)}</span>
              </div>
              <div class="actions">
                <button class="fp3d-btn" ?disabled=${!!this._busy} @click=${() => this.edit(m)}>${this.t("edit")}</button>
                <button class="fp3d-btn fp3d-danger" ?disabled=${!!this._busy} @click=${() => void this.removeModel(m)}>${this.t("remove")}</button>
              </div>
            </div>`,
          )
        : html`<p class="fp3d-sub">${this.t("none")}</p>`}
      ${this._draft ? this.renderDraft(this._draft) : nothing}
      ${this._draft
        ? nothing
        : html`<label class="fp3d-btn fp3d-primary upload">
            ${this._busy === "reading" ? this.t("reading") : this.t("upload")}
            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" hidden ?disabled=${!!this._busy} @change=${(e: Event) => void this.upload(e)} />
          </label>`}
      ${this._msg ? html`<p class="fp3d-sub ${this._msg.ok ? "ok" : "err"}">${this._msg.text}</p>` : nothing}
    </section>`;
  }

  private renderDraft(draft: Draft) {
    const item = draft.item;
    const as = worksAs(item);
    const problems = worksAsProblems(item);
    const mount = item.mount ?? "floor";
    const edges = this.edgesOf(item);
    // always from the draft as it is now, so two quick changes both count
    const set = (patch: Partial<PackItem>) => {
      if (this._draft) this._draft = { ...this._draft, item: { ...this._draft.item, ...patch } };
    };
    const setPart = (i: number, patch: Partial<PackPart>) => {
      if (!this._draft) return;
      const parts = this._draft.item.parts.map((p, j) => {
        if (j !== i) return p;
        const q: PackPart = { ...p, ...patch };
        for (const k of Object.keys(patch) as (keyof PackPart)[]) if (patch[k] === undefined || patch[k] === false) delete q[k];
        return q;
      });
      set({ parts });
    };
    const size = (axis: 0 | 1 | 2, v: string) => {
      const n = Number(v);
      if (!(n > 0)) return;
      const s = [...(this._draft?.item.size ?? item.size)] as [number, number, number];
      s[axis] = Math.min(40, n);
      set({ size: s });
    };
    const tooHeavy = draft.triangles > MAX_TRIANGLES;
    return html`<div class="draft">
      <div class="grid">
        <label class="fp3d-field wide">${this.t("name")}
          <input .value=${this.name(item)} maxlength="80" @input=${(e: Event) => set({ name: { ...item.name, en: (e.target as HTMLInputElement).value || item.id } })} />
        </label>
        ${(["width", "depth", "height"] as const).map(
          (k, a) => html`<label class="fp3d-field">${this.t(k)}
            <input type="number" min="0.01" max="40" step="0.01" .value=${String(item.size[a])} @change=${(e: Event) => size(a as 0 | 1 | 2, (e.target as HTMLInputElement).value)} />
          </label>`,
        )}
        <label class="fp3d-field">${this.t("mount")}
          <select @change=${(e: Event) => {
            const v = (e.target as HTMLSelectElement).value as NonNullable<PackItem["mount"]>;
            set(v === "floor" ? { mount: undefined, wall_y: undefined } : { mount: v, wall_y: v === "wall" ? (item.wall_y ?? 1.2) : undefined });
          }}>
            ${(["floor", "surface", "wall", "ceiling"] as const).map((m) => html`<option value=${m} ?selected=${m === mount}>${this.t(`mount_${m}`)}</option>`)}
          </select>
        </label>
        ${mount === "wall"
          ? html`<label class="fp3d-field">${this.t("wall_y")}
              <input type="number" min="0" max="10" step="0.05" .value=${String(item.wall_y ?? 1.2)} @change=${(e: Event) => set({ wall_y: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
            </label>`
          : nothing}
        <label class="fp3d-field">${this.t("works_as")}
          <select @change=${(e: Event) => {
            const cur = this._draft;
            if (cur) this._draft = { ...cur, item: setWorksAs(cur.item, (e.target as HTMLSelectElement).value as WorksAs, cur.item.light ?? "ceiling") };
          }}>
            ${WORKS_AS.map((w) => html`<option value=${w} ?selected=${w === as}>${this.t(`as_${w}` as Key)}</option>`)}
          </select>
        </label>
        ${as === "lamp"
          ? html`<label class="fp3d-field">${this.t("light")}
              <select @change=${(e: Event) => set({ light: (e.target as HTMLSelectElement).value as LampModel })}>
                ${LAMP_STYLES.map((l) => html`<option value=${l} ?selected=${l === item.light}>${l}</option>`)}
              </select>
            </label>`
          : nothing}
        <label class="fp3d-field">${this.t("edges")}
          <select @change=${(e: Event) => this.setEdges((e.target as HTMLSelectElement).value as Edges)}>
            ${(["none", "faint", "soft", "glow"] as const).map((x) => html`<option value=${x} ?selected=${x === edges}>${this.t(`edges_${x}`)}</option>`)}
          </select>
        </label>
      </div>
      ${problems.map((p) => html`<p class="fp3d-sub err">${this.t(p)}</p>`)}
      ${draft.scaledTo ? html`<p class="fp3d-sub warn">${this.t("scaled", { size: draft.scaledTo })}</p>` : nothing}
      ${tooHeavy
        ? html`<p class="fp3d-sub err">${this.t("too_heavy", { n: draft.triangles, max: MAX_TRIANGLES })}</p>`
        : draft.triangles > HEAVY_TRIANGLES
          ? html`<p class="fp3d-sub warn">${this.t("heavy", { n: draft.triangles })}</p>`
          : nothing}
      <h4>${this.t("parts")}</h4>
      <div class="parts">
        ${item.parts.map(
          (p, i) => html`<div class="part">
            <span class="pname" title=${p.name ?? ""}>${p.name ?? `#${i + 1}`}</span>
            <input type="color" title=${this.t("part_color")} .value=${p.color.startsWith("#") ? p.color : "#8a9bb8"} @input=${(e: Event) => setPart(i, { color: (e.target as HTMLInputElement).value })} />
            ${as === "lamp" || as === "fan"
              ? html`<label><input type="checkbox" .checked=${!!p.glow} @change=${(e: Event) => setPart(i, { glow: (e.target as HTMLInputElement).checked })} /> ${this.t("part_glow")}</label>`
              : nothing}
            ${as === "fan"
              ? html`<label><input type="checkbox" .checked=${!!p.spin} @change=${(e: Event) => setPart(i, { spin: (e.target as HTMLInputElement).checked ? "y" : undefined })} /> ${this.t("part_spin")}</label>`
              : nothing}
            ${as === "screen"
              ? html`<label><input type="checkbox" .checked=${!!p.screen} @change=${(e: Event) => setPart(i, { screen: (e.target as HTMLInputElement).checked })} /> ${this.t("part_screen")}</label>`
              : nothing}
          </div>`,
        )}
      </div>
      <div class="actions">
        <button class="fp3d-btn fp3d-primary" ?disabled=${!!this._busy || tooHeavy} @click=${() => void this.save()}>${this._busy === "saving" ? this.t("saving") : this.t("save")}</button>
        <button class="fp3d-btn" ?disabled=${!!this._busy} @click=${() => (this._draft = null)}>${this.t("cancel")}</button>
      </div>
    </div>`;
  }

  /** The edge style all parts share (the first part's). */
  private edgesOf(item: PackItem): Edges {
    const e = item.parts[0]?.edges;
    return e === "faint" ? "faint" : e === "glow" ? "glow" : e ? "soft" : "none";
  }

  private setEdges(edges: Edges): void {
    if (!this._draft) return;
    const value: PackPart["edges"] = edges === "none" ? undefined : edges === "soft" ? true : edges;
    const parts = this._draft.item.parts.map((p) => {
      const q = { ...p };
      if (value === undefined) delete q.edges;
      else q.edges = value;
      return q;
    });
    this._draft = { ...this._draft, item: { ...this._draft.item, parts } };
  }

  private edit(item: PackItem): void {
    this._msg = null;
    const triangles = item.parts.reduce((s, p) => s + (p.mesh ? Math.round((atob(p.mesh.t).length / (p.mesh.big ? 4 : 2)) / 3) : 0), 0);
    this._draft = { item: structuredClone(item), isNew: false, triangles, scaledTo: null };
  }

  private async upload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this._msg = null;
    this._busy = "reading";
    try {
      const meshes = readGltf(await file.arrayBuffer());
      const name = file.name.replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ").trim() || "Model";
      const { item, triangles, scale } = buildModel(meshes, name, modelId(name, new Set(this.models.map((m) => m.id))));
      this._draft = { item, isNew: true, triangles, scaledTo: scale !== 1 ? `${item.size.map((v) => v.toFixed(2)).join(" × ")} m` : null };
    } catch (err) {
      const code = err instanceof GltfError ? err.code : "not_gltf";
      this._msg = { ok: false, text: this.t(`err_${code}` as Key) };
    } finally {
      this._busy = null;
    }
  }

  private async save(): Promise<void> {
    const draft = this._draft;
    if (!draft || !this.hass) return;
    this._busy = "saving";
    try {
      await saveModel(this.hass, { ...draft.item, source: "upload" } as PackItem);
      this._msg = { ok: true, text: this.t("saved", { name: this.name(draft.item) }) };
      this._draft = null;
      this.dispatchEvent(new CustomEvent("packs-changed", { bubbles: true, composed: true }));
    } catch (err) {
      const { message } = (err ?? {}) as { message?: string };
      this._msg = { ok: false, text: this.t("err_save", { detail: message ?? String(err) }) };
    } finally {
      this._busy = null;
    }
  }

  private async removeModel(item: PackItem): Promise<void> {
    if (!this.hass || !confirm(this.t("remove_confirm", { name: this.name(item) }))) return;
    this._busy = "saving";
    try {
      await deleteModel(this.hass, item.id);
      if (this._draft?.item.id === item.id) this._draft = null;
      this.dispatchEvent(new CustomEvent("packs-changed", { bubbles: true, composed: true }));
    } catch (err) {
      const { message } = (err ?? {}) as { message?: string };
      this._msg = { ok: false, text: this.t("err_save", { detail: message ?? String(err) }) };
    } finally {
      this._busy = null;
    }
  }

  static styles = [
    tokens,
    controls,
    css`
      .card {
        padding: 14px 16px;
        border: 1px solid var(--fp3d-line);
        border-radius: 14px;
        background: var(--fp3d-chrome);
      }
      h3 {
        margin: 0 0 8px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--fp3d-soft);
      }
      h4 {
        margin: 12px 0 6px;
        font-size: 12px;
        color: var(--fp3d-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--fp3d-line);
      }
      .row > div:first-child {
        display: grid;
        gap: 2px;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .draft {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid var(--fp3d-line);
        border-radius: 12px;
        background: rgba(4, 8, 18, 0.35);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .parts {
        display: grid;
        gap: 4px;
        max-height: 320px;
        overflow: auto;
        margin-bottom: 12px;
      }
      .part {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
      }
      .part input[type="color"] {
        width: 34px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--fp3d-line);
        border-radius: 6px;
        background: none;
        cursor: pointer;
      }
      .part label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--fp3d-muted);
        white-space: nowrap;
      }
      .pname {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .upload {
        display: block;
        margin-top: 10px;
        text-align: center;
        cursor: pointer;
      }
      .ok {
        color: #34d399;
      }
      .warn {
        color: var(--fp3d-warm);
      }
      .err {
        color: var(--fp3d-danger);
      }
    `,
  ];
}

if (!customElements.get("fp3d-my-models")) customElements.define("fp3d-my-models", MyModels);
