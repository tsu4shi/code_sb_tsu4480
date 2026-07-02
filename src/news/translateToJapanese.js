import { MAX_TRANSLATION_CHARS, TRANSLATION_DELAY_MS } from "./config.js";
import { UpstreamError } from "./errors.js";

let lastTranslationAt = 0;

async function enforceTranslationDelay() {
  const now = Date.now();
  const elapsed = now - lastTranslationAt;
  if (elapsed < TRANSLATION_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, TRANSLATION_DELAY_MS - elapsed)
    );
  }
  lastTranslationAt = Date.now();
}

/**
 * Translate English text to Japanese via MyMemory (no API key required).
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateToJapanese(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return trimmed;

  await enforceTranslationDelay();

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", trimmed.slice(0, MAX_TRANSLATION_CHARS));
  url.searchParams.set("langpair", "en|ja");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new UpstreamError(
      `Translation request failed (HTTP ${response.status})`,
      response.status
    );
  }

  const data = await response.json();
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
    throw new UpstreamError("Translation service returned an unexpected response");
  }

  return String(data.responseData.translatedText).trim();
}

/**
 * Translate article title and summary to Japanese.
 * @param {{ title: string, summary?: string }} article
 * @returns {Promise<{ title: string, summary?: string, titleOriginal: string, summaryOriginal?: string }>}
 */
export async function translateArticleToJapanese(article) {
  const titleOriginal = article.title;
  const summaryOriginal = article.summary;

  const title = await translateToJapanese(titleOriginal);
  const translated = {
    title,
    titleOriginal,
    url: article.url,
    publishedAt: article.publishedAt,
    source: article.source,
  };

  if (summaryOriginal) {
    translated.summary = await translateToJapanese(summaryOriginal);
    translated.summaryOriginal = summaryOriginal;
  }

  return translated;
}
