import test from "node:test";
import assert from "node:assert/strict";
import { TIME_CONTROLS, controlLabel, ratingColumnForTime } from "../src/lib/timeControls.ts";

test("all eight supported controls are exact and have no increment", () => {
  assert.deepEqual(TIME_CONTROLS.map((control) => control.initialTimeMs), [
    30000, 15000, 7500, 3250, 1625, 812.5, 406.25, 203.125,
  ]);
  assert.ok(TIME_CONTROLS.every((control) => control.incrementMs === 0));
});

test("each time control has its own independent rating pool", () => {
  assert.equal(new Set(TIME_CONTROLS.map((control) => control.ratingPool)).size, 8);
  assert.equal(new Set(TIME_CONTROLS.map((control) => control.ratingColumn)).size, 8);
  for (const control of TIME_CONTROLS) {
    assert.equal(ratingColumnForTime(control.initialTimeMs), control.ratingColumn);
  }
});

test("time-control labels resolve exactly and reject unknown controls", () => {
  assert.equal(controlLabel(30000, 0), "30 seconds · Hyperbullet");
  assert.equal(controlLabel(15000, 0), "15 seconds · Ultrabullet");
  assert.equal(controlLabel(7500, 0), "7.5 seconds · Ultrazerk");
  assert.equal(controlLabel(203.125, 0), "0.203125 seconds · Psycho");
  assert.equal(controlLabel(15000, 1), "Custom");
  assert.equal(ratingColumnForTime(12345), "ultrabullet_rating");
});
