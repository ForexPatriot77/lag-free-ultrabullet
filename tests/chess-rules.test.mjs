import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";

test("chess.js starts from the standard position with 20 legal moves", () => {
  const chess = new Chess();
  assert.equal(chess.moves().length, 20);
  assert.equal(chess.fen(), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
});

test("legal moves update turn and position", () => {
  const chess = new Chess();
  const move = chess.move({ from: "e2", to: "e4" });
  assert.equal(move.san, "e4");
  assert.equal(chess.turn(), "b");
  assert.equal(chess.history().length, 1);
});

test("illegal moves are rejected", () => {
  const chess = new Chess();
  assert.throws(() => chess.move({ from: "e2", to: "e5" }));
});

test("checkmate is detected", () => {
  const chess = new Chess();
  for (const san of ["f3", "e5", "g4", "Qh4#"]) chess.move(san);
  assert.equal(chess.isCheckmate(), true);
});
