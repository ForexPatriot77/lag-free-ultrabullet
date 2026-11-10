export type ArcadeMode = "frenzy" | "endurance" | "cheat";

/** In Frenzy and Endurance the three black tiles are the targets. Cheat accepts every tile. */
export function isSuccessfulTap(mode: ArcadeMode, tileIsBlack: boolean): boolean {
  return mode === "cheat" || tileIsBlack;
}

export function nextFrenzyBonus(current: number): number {
  return Math.min(100, Math.max(0, current) + 8);
}

export function frenzyPointsForBonus(bonus: number): number {
  return Math.ceil(Math.max(0, bonus) / 20);
}

export function decayFrenzyBonus(current: number, elapsedMs: number): number {
  return Math.max(0.1, current - Math.max(0, elapsedMs) * 0.03);
}

/** Move a successfully tapped black tile to a different, currently empty square. */
export function relocateBlackTile(blackTiles: number[], tappedIndex: number, random = Math.random): number[] {
  const slot = blackTiles.indexOf(tappedIndex);
  if (slot < 0) return blackTiles;
  const occupied = new Set(blackTiles);
  occupied.delete(tappedIndex);
  const available = Array.from({ length: 16 }, (_, index) => index).filter((index) => !occupied.has(index) && index !== tappedIndex);
  if (!available.length) return blackTiles;
  const replacement = available[Math.floor(random() * available.length)];
  const next = [...blackTiles];
  next[slot] = replacement;
  return next;
}

export function createBlackTiles(random = Math.random): number[] {
  const tiles = new Set<number>();
  while (tiles.size < 3) tiles.add(Math.floor(random() * 16));
  return [...tiles];
}
