import { ConfigError, DocumentAiError } from "./errors.js";
import { guessMimeType } from "./imageBase64.js";

/**
 * @param {{ projectId: string, location: string, processorId: string }} config
 * @returns {string}
 */
export function buildProcessUrl(config) {
  const projectId = String(config.projectId || "").trim();
  const location = String(config.location || "").trim();
  const processorId = String(config.processorId || "").trim();
  if (!projectId || !location || !processorId) {
    throw new ConfigError("Document AI のプロセッサ設定が不完全です");
  }
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  return `https://${location}-documentai.googleapis.com/v1/${name}:process`;
}

/**
 * Call Document AI processors.process on one image.
 *
 * @param {object} options
 * @param {string} options.accessToken
 * @param {{ projectId: string, location: string, processorId: string }} options.processor
 * @param {string} options.imageBase64 - raw base64 (no data: prefix)
 * @param {string} [options.mimeType]
 * @param {string} [options.fileName]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ document: object, raw: object }>}
 */
export async function processExpenseDocument({
  accessToken,
  processor,
  imageBase64,
  mimeType,
  fileName,
  fetchImpl = fetch,
}) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new ConfigError("Document AI のアクセストークンがありません。先に利用許可してください。");
  }
  if (!imageBase64) {
    throw new ConfigError("画像データが空です");
  }

  const url = buildProcessUrl(processor);
  const body = {
    rawDocument: {
      content: imageBase64,
      mimeType: guessMimeType(fileName, mimeType),
    },
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new DocumentAiError(`Document AI への接続に失敗しました: ${err.message || err}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new DocumentAiError(
      `Document AI の応答を解析できませんでした (HTTP ${response.status})`,
      response.status
    );
  }

  if (!response.ok) {
    const apiMessage = json?.error?.message || `HTTP ${response.status}`;
    throw new DocumentAiError(`Document AI エラー: ${apiMessage}`, response.status);
  }

  const document = json?.document;
  if (!document) {
    throw new DocumentAiError("Document AI の応答に document がありません");
  }

  return { document, raw: json };
}
