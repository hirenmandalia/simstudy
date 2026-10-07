import sharp from "sharp";
import type { Screen } from "./types";

/** Claude's vision input works best at <= 1568 px on the long edge and rejects images over 5 MB. */
const MAX_EDGE = 1568;
const MAX_OUTPUT_BYTES = 4.5 * 1024 * 1024;

export interface PreparedImage {
  data: Buffer;
  mediaType: Screen["mediaType"];
  ext: string;
}

/**
 * Normalise an uploaded screenshot for the model: apply EXIF rotation, shrink to
 * fit MAX_EDGE (never enlarge) and keep it under the API's size limit. The model
 * would downscale larger images anyway, so this loses nothing it would see and
 * cuts the token cost of every call that includes the screen.
 */
export async function prepareScreenshot(input: Buffer, mediaType: Screen["mediaType"]): Promise<PreparedImage> {
  const base = sharp(input, { animated: false })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });

  if (mediaType === "image/jpeg") {
    return { data: await base.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), mediaType: "image/jpeg", ext: "jpg" };
  }
  // Screenshots compress well as PNG; fall back to JPEG if a photo-heavy screen is still too big.
  const png = await base.clone().png({ compressionLevel: 9, palette: false }).toBuffer();
  if (png.length <= MAX_OUTPUT_BYTES) return { data: png, mediaType: "image/png", ext: "png" };
  return { data: await base.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), mediaType: "image/jpeg", ext: "jpg" };
}
