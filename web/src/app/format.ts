/** Number and size labels for the interface. */

/** File size with one decimal, for example "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Fixed decimals without a minus sign on values that round to zero. */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

/** "512 x 384 px" */
export function formatSize(size: { width: number; height: number }): string {
  return `${size.width} x ${size.height} px`;
}

/** Two-digit uppercase hex color, for example "#3A7BFF". */
export function hexColor(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
