// Z-index layer stack — edit here to adjust stacking order across the app
export const Z = {
  canvasBase:      10,   // doodle drawing canvas
  canvasConfetti:  11,   // confetti animation canvas
  drawToolbar:     20,   // drawing tool palette (inside tier list container)
  cursors:         40,   // other players' cursors
  duelCutscene:    90,   // duel result overlay (below modals so modals can dismiss it)
  modal:          100,   // all popups, drawers, and toasts
} as const;

// Limits that must stay in sync with server/lib/constants.js
export const MAX_ITEMS = 100;
export const MAX_IMAGE_BYTES = 200_000; // ~150 KB base64 encoded
export const MAX_TIERS = 20;
export const MAX_TIER_LABEL_LENGTH = 50;
export const MAX_TITLE_LENGTH = 100;
export const MAX_TEXT_ITEM_LENGTH = 200;
