/** Free-tier guardrails and storage keys for the receipts OCR tool. */

/** Google Cloud Vision free tier: first 1000 units/month per feature. */
export const FREE_TIER_MONTHLY_LIMIT = 1000;

/** localStorage key for the user-provided Vision API key. */
export const API_KEY_STORAGE_KEY = "receipts:visionApiKey:v1";

/** localStorage key for monthly OCR usage counters. */
export const QUOTA_STORAGE_KEY = "receipts:visionQuota:v1";

/** Vision feature used for receipt OCR (counts against its own free quota). */
export const VISION_FEATURE = "DOCUMENT_TEXT_DETECTION";

export const VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate";
