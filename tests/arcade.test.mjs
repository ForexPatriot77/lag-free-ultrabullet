import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlackTiles, decayFrenzyBonus, frenzyPointsForBonus,
  isSuccessfulTap, nextFrenzyBonus, relocateBlackTile,
} from "../src/lib/arcade.ts";

test("Frenzy and Endurance require black target tiles", () => {
  assert.equal(isSuccessfulTap("frenzy", true), true);
  assert.equal(isSuccessfulTap("frenzy", false), false);
  assert.equal(isSuccessfulTap("endurance", true), true);
  assert.equal(isSuccessfulTap("endurance", false), false);
});

test("Cheat accepts every square, including white squares", () => {
  assert.equal(isSuccessfulTap("cheat", true), true);
  assert.equal(isSuccessfulTap("cheat", false), true);
});

test("Frenzy combo bonus increases by eight, caps at 100, and scores by 20-point bands", () => {
  assert.equal(nextFrenzyBonus(0), 8);
  assert.equal(frenzyPointsForBonus(8), 1);
  assert.equal(frenzyPointsForBonus(20), 1);
  assert.equal(frenzyPointsForBonus(21), 2);
  assert.equal(nextFrenzyBonus(96), 100);
  assert.equal(nextFrenzyBonus(100), 100);
});

test("Frenzy bonus decays at three points per 100ms and never becomes negative", () => {
  assert.equal(decayFrenzyBonus(50, 100), 47);
  assert.equal(decayFrenzyBonus(50, 500), 35);
  assert.equal(decayFrenzyBonus(1, 1000), 0.1);
});

test("A hit relocates only that black tile to an empty square", () => {
  const before = [0, 5, 10];
  const after = relocateBlackTile(before, 5, () => 0.99);
  assert.equal(after.length, 3);
  assert.equal(after.includes(0), true);
  assert.equal(after.includes(10), true);
  assert.equal(after.includes(5), false);
  assert.equal(new Set(after).size, 3);
  assert.equal(before.join(","), "0,5,10");
});

test("A non-target tap does not relocate a tile", () => {
  const before = [0, 5, 10];
  assert.equal(relocateBlackTile(before, 3), before);
});

test("New Frenzy and Endurance boards contain exactly three unique targets", () => {
  const sequence = [0.01, 0.31, 0.72];
  let index = 0;
  const tiles = createBlackTiles(() => sequence[index++ % sequence.length]);
  assert.equal(tiles.length, 3);
  assert.equal(new Set(tiles).size, 3);
  assert.ok(tiles.every((tile) => tile >= 0 && tile < 16));
});
