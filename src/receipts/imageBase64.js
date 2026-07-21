import { ConfigError } from "./errors.js";

/**
 * @param {Blob|ArrayBuffer|Uint8Array} imageBytes
 * @returns {Promise<string>} Base64 without data-URL prefix
 */
export async function imageToBase64(imageBytes) {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(imageBytes)) {
    return imageBytes.toString("base64");
  }

  let bytes;
  if (imageBytes instanceof ArrayBuffer) {
    bytes = new Uint8Array(imageBytes);
  } else if (ArrayBuffer.isView(imageBytes)) {
    bytes = new Uint8Array(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength);
  } else if (typeof Blob !== "undefined" && imageBytes instanceof Blob) {
    const buf = await imageBytes.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else {
    throw new ConfigError("画像データを読み込めませんでした");
  }

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * @param {string} fileName
 * @param {string} [mimeType]
 * @returns {string}
 */
export function guessMimeType(fileName, mimeType) {
  const typed = String(mimeType || "").trim().toLowerCase();
  if (typed.startsWith("image/")) return typed;
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  return "image/jpeg";
}
