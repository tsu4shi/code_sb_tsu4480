import { VISION_ANNOTATE_URL, VISION_FEATURE } from "./config.js";
import { ConfigError, VisionApiError } from "./errors.js";

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
 * Call Google Cloud Vision DOCUMENT_TEXT_DETECTION on one image.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.imageBase64 - raw base64 (no data: prefix)
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ fullText: string, raw: object }>}
 */
export async function annotateDocumentText({ apiKey, imageBase64, fetchImpl = fetch }) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new ConfigError("Vision APIキーが設定されていません");
  }
  if (!imageBase64) {
    throw new ConfigError("画像データが空です");
  }

  const url = `${VISION_ANNOTATE_URL}?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: VISION_FEATURE }],
        imageContext: { languageHints: ["ja", "en"] },
      },
    ],
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new VisionApiError(`Vision APIへの接続に失敗しました: ${err.message || err}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new VisionApiError(`Vision APIの応答を解析できませんでした (HTTP ${response.status})`, response.status);
  }

  if (!response.ok) {
    const apiMessage =
      json?.error?.message || json?.responses?.[0]?.error?.message || `HTTP ${response.status}`;
    throw new VisionApiError(`Vision APIエラー: ${apiMessage}`, response.status);
  }

  const first = json?.responses?.[0];
  if (first?.error) {
    throw new VisionApiError(`Vision APIエラー: ${first.error.message || JSON.stringify(first.error)}`);
  }

  const fullText =
    first?.fullTextAnnotation?.text ||
    first?.textAnnotations?.[0]?.description ||
    "";

  return { fullText: String(fullText), raw: json };
}
