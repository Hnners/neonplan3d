"""The user's own furniture models (3D files they uploaded, see frontend/src/my-models.ts).

They are kept apart from the furniture packs: packs come signed from the shop and are checked on every import,
while these come from the user's own Home Assistant. The frontend gets them as one extra pack, "My models", so
everything a pack item can do (a lamp's glowing shade, a fan's turning blades, a TV's screen, a sensor) works
for them as well. That pack is never stored with the packs, never exported as a pack and never verified.
"""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol

# The id of the pack the models are shown in; a furniture type is "pack:local.models:<model id>".
MODELS_PACK_ID = "local.models"
MAX_MODELS = 200
# One model as JSON (its meshes are packed in base64, see the frontend): enough for a detailed piece of furniture.
MAX_MODEL_SIZE = 3_000_000
MAX_PARTS = 120

# how a lamp's light spreads (LampModel in the frontend's viewer3d.ts)
LAMP_MODELS = (
    "ceiling",
    "downlight",
    "spot",
    "panel",
    "pendant",
    "fan",
    "floor",
    "uplight",
    "table",
    "wall",
    "strip",
    "bollard",
    "garden",
)

_NUM = vol.Coerce(float)
_COLOR = vol.All(str, vol.Length(max=32))
_B64 = vol.All(str, vol.Match(r"^[A-Za-z0-9+/=]*$"))

PART = vol.Schema(
    {
        vol.Required("shape"): vol.In(("box", "cyl", "loft", "mesh")),
        vol.Required("x"): _NUM,
        vol.Required("z"): _NUM,
        vol.Required("w"): _NUM,
        vol.Required("d"): _NUM,
        vol.Required("y"): _NUM,
        vol.Required("h"): _NUM,
        vol.Required("color"): _COLOR,
        vol.Optional("name"): vol.All(str, vol.Length(max=80)),
        vol.Optional("top"): _COLOR,
        vol.Optional("edges"): vol.Any(bool, vol.In(("glow", "faint"))),
        vol.Optional("glow"): bool,
        vol.Optional("screen"): bool,
        vol.Optional("spin"): vol.In(("y", "z")),
        vol.Optional("mesh"): {vol.Required("v"): _B64, vol.Required("t"): _B64, vol.Optional("big"): bool},
    }
)

MODEL = vol.Schema(
    {
        vol.Required("id"): vol.All(str, vol.Match(r"^[a-z0-9_\-]{1,40}$")),
        vol.Required("name"): {vol.All(str, vol.Length(max=8)): vol.All(str, vol.Length(min=1, max=80))},
        vol.Required("size"): vol.All([vol.All(_NUM, vol.Range(min=0.01, max=40))], vol.Length(min=3, max=3)),
        vol.Required("parts"): vol.All([PART], vol.Length(min=1, max=MAX_PARTS)),
        vol.Optional("mount"): vol.In(("floor", "surface", "wall", "ceiling")),
        vol.Optional("wall_y"): vol.All(_NUM, vol.Range(min=0, max=10)),
        vol.Optional("light"): vol.In(LAMP_MODELS),
        vol.Optional("electric"): bool,
        vol.Optional("family"): vol.All(str, vol.Length(max=40)),
        vol.Optional("surface"): bool,
        vol.Optional("symbol"): [dict],
        vol.Optional("tags"): [vol.All(str, vol.Length(max=40))],
        vol.Optional("source"): vol.All(str, vol.Length(max=120)),
    }
)


class ModelError(Exception):
    """A model that cannot be kept."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def check_model(raw: Any) -> dict[str, Any]:
    """The model as it is kept, or a ModelError."""
    if not isinstance(raw, dict):
        raise ModelError("invalid_format", "A model is an object")
    if len(json.dumps(raw)) > MAX_MODEL_SIZE:
        raise ModelError("too_large", "The model is too detailed (more than 3 MB once packed)")
    try:
        return MODEL(raw)
    except vol.Invalid as err:
        raise ModelError("invalid_format", str(err)) from err


def models_pack(models: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The models as the pack the frontend shows them in (None without any)."""
    if not models:
        return None
    return {
        "id": MODELS_PACK_ID,
        "name": "My models",
        "publisher": "You",
        "licensee": None,
        "local": True,
        "items": models,
    }
