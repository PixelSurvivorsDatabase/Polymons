import { useEffect, useMemo, useState } from "react";
import { ClampToEdgeWrapping, SRGBColorSpace, Texture, TextureLoader } from "three";
import {
  PART_IMAGE_FACE_KEYS,
  normalizePartImageFaces,
  type PartImageFace,
  type PartImageFaces,
} from "./partImageFaces";

export type PartImageTextureMap = Partial<Record<PartImageFace, Texture>>;

export function usePartImageTextures(
  imageFaces?: PartImageFaces,
): PartImageTextureMap {
  const normalized = useMemo(
    () => normalizePartImageFaces(imageFaces),
    [imageFaces],
  );
  const signature = useMemo(
    () =>
      PART_IMAGE_FACE_KEYS.map((face) => `${face}:${normalized[face] ?? ""}`).join("|"),
    [normalized],
  );
  const [textures, setTextures] = useState<PartImageTextureMap>({});

  useEffect(() => {
    const urls = [...new Set(PART_IMAGE_FACE_KEYS
      .map((face) => normalized[face])
      .filter((url): url is string => Boolean(url)))];
    if (urls.length === 0) {
      setTextures({});
      return;
    }

    let cancelled = false;
    const loader = new TextureLoader();
    const loaded = new Map<string, Texture>();

    Promise.all(
      urls.map(
        (url) =>
          new Promise<[string, Texture] | null>((resolve) => {
            loader.load(
              url,
              (texture) => {
                texture.colorSpace = SRGBColorSpace;
                texture.wrapS = ClampToEdgeWrapping;
                texture.wrapT = ClampToEdgeWrapping;
                texture.needsUpdate = true;
                loaded.set(url, texture);
                resolve([url, texture]);
              },
              undefined,
              () => resolve(null),
            );
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      const next: PartImageTextureMap = {};
      for (const face of PART_IMAGE_FACE_KEYS) {
        const url = normalized[face];
        const texture = url ? loaded.get(url) : undefined;
        if (texture) next[face] = texture;
      }
      setTextures(next);
    });

    return () => {
      cancelled = true;
      for (const texture of loaded.values()) texture.dispose();
    };
  }, [normalized, signature]);

  return textures;
}

