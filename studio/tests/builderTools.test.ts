import assert from "node:assert/strict";
import test from "node:test";
import {
  alignSelectedObjects,
  distributeSelectedObjects,
  type ArrangeableObject,
} from "../renderer/builderTools.js";

function object(
  id: string,
  x: number,
  size = 2,
): ArrangeableObject {
  return {
    id,
    position: [x, 0, 0],
    scale: [size, 2, 2],
  };
}

test("aligns selected object edges to the active object", () => {
  const result = alignSelectedObjects(
    [object("anchor", 5, 4), object("other", -3, 2), object("untouched", 20)],
    ["anchor", "other"],
    0,
    "min",
    "anchor",
  );
  assert.equal(result[0].position[0], 5);
  assert.equal(result[1].position[0], 4);
  assert.equal(result[2].position[0], 20);
});

test("distributes selected object centers evenly while keeping endpoints", () => {
  const result = distributeSelectedObjects(
    [object("first", 0), object("middle", 8), object("last", 10)],
    ["first", "middle", "last"],
    0,
  );
  assert.deepEqual(result.map((item) => item.position[0]), [0, 5, 10]);
});

test("does not distribute fewer than three objects", () => {
  const objects = [object("first", 0), object("last", 10)];
  assert.equal(distributeSelectedObjects(objects, ["first", "last"], 0), objects);
});
