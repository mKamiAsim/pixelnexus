import { useEffect, useRef } from "react";

import type { RgbaImage } from "@/core/image/types";

/** Draw an image at a given zoom. Above 100% pixels stay sharp, as in the real viewport. */
export function ImageCanvas({
  image,
  zoom,
  className,
  label,
}: {
  image: RgbaImage;
  zoom: number;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    context?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  }, [image]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      width={image.width}
      height={image.height}
      className={className}
      style={{
        width: image.width * zoom,
        height: image.height * zoom,
        imageRendering: zoom >= 1 ? "pixelated" : "auto",
      }}
    />
  );
}
