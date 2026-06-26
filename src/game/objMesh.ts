import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from "three";

type ObjVertex = [number, number, number];

function vertexIndex(token: string, vertexCount: number): number | null {
  const raw = Number(token.split("/")[0]);
  if (!Number.isInteger(raw) || raw === 0) return null;
  return raw > 0 ? raw - 1 : vertexCount + raw;
}

export function normalizedObjGeometry(
  source: string,
  targetSize: [number, number, number],
): BufferGeometry {
  const vertices: ObjVertex[] = [];
  const positions: number[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      const vertex = [Number(x), Number(y), Number(z)] as ObjVertex;
      if (vertex.every(Number.isFinite)) vertices.push(vertex);
      continue;
    }
    if (!line.startsWith("f ")) continue;
    const indices = line
      .slice(2)
      .trim()
      .split(/\s+/)
      .map((token) => vertexIndex(token, vertices.length))
      .filter((index): index is number => index !== null);
    if (indices.length < 3) continue;
    for (let cursor = 1; cursor < indices.length - 1; cursor += 1) {
      for (const index of [indices[0], indices[cursor], indices[cursor + 1]]) {
        const vertex = vertices[index];
        if (vertex) positions.push(vertex[0], vertex[1], vertex[2]);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scale = Math.min(
    targetSize[0] / Math.max(size.x, 0.0001),
    targetSize[1] / Math.max(size.y, 0.0001),
    targetSize[2] / Math.max(size.z, 0.0001),
  );

  const attribute = geometry.getAttribute("position") as Float32BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) {
    attribute.setXYZ(
      index,
      (attribute.getX(index) - center.x) * scale,
      (attribute.getY(index) - center.y) * scale,
      (attribute.getZ(index) - center.z) * scale,
    );
  }
  attribute.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}
