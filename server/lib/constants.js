export const MAX_PLAYERS = 30;
export const MAX_ITEMS = 300;
export const MAX_IMAGE_BYTES = 200_000; // ~150 KB base64 encoded
export const GRACE_MS = 30_000;
export const MAX_ROOM_MS = 8 * 60 * 60 * 1000; // 8 hours

export const DEFAULT_TIERS = [
  { label: "S", color: "#FF4444" },
  { label: "A", color: "#FF8C00" },
  { label: "B", color: "#FFD700" },
  { label: "C", color: "#32CD32" },
  { label: "D", color: "#1E90FF" },
];

export const TIER_PALETTE = [
  "#FF4444", "#FF8C00", "#FFD700", "#32CD32",
  "#1E90FF", "#9932CC", "#FF69B4", "#00CED1",
];
