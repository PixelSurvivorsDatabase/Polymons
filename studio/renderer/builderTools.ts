export type ArrangeAxis = 0 | 1 | 2;
export type AlignEdge = "min" | "center" | "max";

export type ArrangeableObject = {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
};

function edgeCoordinate(
  object: ArrangeableObject,
  axis: ArrangeAxis,
  edge: AlignEdge,
): number {
  if (edge === "center") return object.position[axis];
  const halfSize = Math.abs(object.scale[axis]) / 2;
  return object.position[axis] + (edge === "min" ? -halfSize : halfSize);
}

export function alignSelectedObjects<T extends ArrangeableObject>(
  objects: T[],
  selectedIds: readonly string[],
  axis: ArrangeAxis,
  edge: AlignEdge,
  anchorId?: string,
): T[] {
  const selected = new Set(selectedIds);
  const anchor =
    objects.find((object) => object.id === anchorId && selected.has(object.id)) ??
    objects.find((object) => selected.has(object.id));
  if (!anchor || selected.size < 2) return objects;
  const target = edgeCoordinate(anchor, axis, edge);

  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    const position = [...object.position] as [number, number, number];
    position[axis] += target - edgeCoordinate(object, axis, edge);
    return { ...object, position };
  });
}

export function distributeSelectedObjects<T extends ArrangeableObject>(
  objects: T[],
  selectedIds: readonly string[],
  axis: ArrangeAxis,
): T[] {
  const selected = new Set(selectedIds);
  const ordered = objects
    .filter((object) => selected.has(object.id))
    .sort((left, right) => left.position[axis] - right.position[axis]);
  if (ordered.length < 3) return objects;

  const first = ordered[0].position[axis];
  const spacing =
    (ordered[ordered.length - 1].position[axis] - first) /
    (ordered.length - 1);
  const positions = new Map(
    ordered.map((object, index) => [object.id, first + spacing * index]),
  );

  return objects.map((object) => {
    const coordinate = positions.get(object.id);
    if (coordinate === undefined) return object;
    const position = [...object.position] as [number, number, number];
    position[axis] = coordinate;
    return { ...object, position };
  });
}
