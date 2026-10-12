import { useEffect, useRef } from "react";

import type { RgbaImage } from "@/core/image/types";

/** A small preview drawn at most `max` CSS pixels on its longest side, over a checkerboard. */
export function Thumbnail({
  image,
  max = 48,
  label,
}: {
  image: RgbaImage;
  max?: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  useEffect(() => {
    let cancelled = false;
    const source = new ImageData(image.data, image.width, image.height);
    void createImageBitmap(source, {
      resizeWidth: width * 2,
      resizeHeight: height * 2,
      resizeQuality: "high",
    }).then((bitmap) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return bitmap.close();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
    });
    return () => {
      cancelled = true;
    };
  }, [image, width, height]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="checkerboard shrink-0 rounded-[3px] border border-border"
      style={{ width, height }}
    />
  );
}
