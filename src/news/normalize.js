/**
 * Normalize a Finnhub news item to the unified article schema.
 * @param {object} item - Raw Finnhub news object
 * @returns {{ title: string, url: string, publishedAt: string, source: string, summary?: string }}
 */
export function normalizeFinnhubArticle(item) {
  const publishedAt = item.datetime
    ? new Date(item.datetime * 1000).toISOString()
    : new Date().toISOString();

  const article = {
    title: String(item.headline || "").trim(),
    url: String(item.url || "").trim(),
    publishedAt,
    source: String(item.source || "Unknown").trim(),
  };

  if (item.summary) {
    article.summary = String(item.summary).trim();
  }

  return article;
}

/**
 * Filter out articles missing required fields.
 * @param {Array} articles
 * @returns {Array}
 */
export function filterValidArticles(articles) {
  return articles.filter((a) => a.title && a.url);
}
