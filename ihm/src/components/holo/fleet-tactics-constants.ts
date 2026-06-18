import * as THREE from 'three';

export const COLOR_DEFAULT = 0x0d7a90;
export const COLOR_SELECTED = 0x20e4ff;
export const EMISS_DEFAULT = 0x020c12;
export const COLOR_OUTLINE = 0x00d4ff;
export const COLOR_RING = 0x00c8f0;
export const MIN_SHIP_GAP = 8;
export const SHIP_GAP_RATIO = 0.18;
export const FLEET_MODEL_FRONT_ROTATION_Y = Math.PI;
export const TACTICAL_FRONT_DIRECTION = new THREE.Vector3(0, 0, 1);

// ── Real-world scale ─────────────────────────────────────────────────────────
// Every ship model is rescaled so its real length (in meters) maps to scene
// world units through a single shared factor. This makes all ships consistent
// in size relative to each other, using the RSI Constellation Andromeda as the
// scale reference (its ~61.2 m length spans REFERENCE_RENDER_SIZE world units).
export const REFERENCE_SHIP_LENGTH_M = 61.2; // RSI Constellation Andromeda overall length
export const REFERENCE_RENDER_SIZE = 122; // world units the reference ship spans
export const WORLD_UNITS_PER_METER = REFERENCE_RENDER_SIZE / REFERENCE_SHIP_LENGTH_M;
// Used when a ship has no known dimensions, so it stays a plausible medium size.
export const FALLBACK_SHIP_LENGTH_M = 28;
