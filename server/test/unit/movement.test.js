const test = require("node:test");
const assert = require("node:assert");
const { measure, positionAt } = require("../../src/services/movement.service");

const path = [[72.57, 23.02], [72.58, 23.02], [72.58, 23.03]]; // east then north

test("path length is the sum of its segments", () => {
  const { total, cum } = measure(path);
  assert.ok(total > 2000 && total < 2500, `total ${total}`);
  assert.strictEqual(cum.length, 3);
});

test("position starts at the first point and ends at the last", () => {
  const { cum, total } = measure(path);
  assert.deepStrictEqual(positionAt(path, cum, total, 0).point, path[0]);
  assert.deepStrictEqual(positionAt(path, cum, total, 1).point, path[2]);
});

test("unit follows the corner, not the straight line", () => {
  const { cum, total } = measure(path);
  const mid = positionAt(path, cum, total, cum[1] / total); // exactly at the corner
  assert.ok(Math.abs(mid.point[0] - 72.58) < 1e-6 && Math.abs(mid.point[1] - 23.02) < 1e-6);
  const before = positionAt(path, cum, total, 0.25);
  assert.ok(Math.abs(before.point[1] - 23.02) < 1e-9); // still on the eastbound leg
  assert.ok(before.heading > 80 && before.heading < 100); // heading east
});

test("single-point path does not crash", () => {
  const p = [[72.5, 23.0]];
  const { cum, total } = measure(p);
  assert.deepStrictEqual(positionAt(p, cum, total, 0.5).point, p[0]);
});
