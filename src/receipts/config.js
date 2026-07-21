/** Document AI (Expense Parser) config and soft monthly usage guardrails. */

/**
 * Soft monthly cap (UTC month) to limit accidental spend.
 * Document AI has no Always Free tier — this is an app-side safety limit only.
 */
export const MONTHLY_SOFT_LIMIT = 200;

/** @deprecated Use MONTHLY_SOFT_LIMIT. Kept for older imports/tests. */
export const FREE_TIER_MONTHLY_LIMIT = MONTHLY_SOFT_LIMIT;

/** localStorage key for Document AI processor settings (not secrets). */
export const PROCESSOR_CONFIG_STORAGE_KEY = "receipts:documentAiProcessor:v1";

/** localStorage key for monthly OCR usage counters. */
export const QUOTA_STORAGE_KEY = "receipts:documentAiQuota:v1";

/** OAuth scope required by Document AI processDocument. */
export const DOCUMENT_AI_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/** Default processor settings for this project's Expense Parser. */
export const DEFAULT_PROCESSOR_CONFIG = {
  projectId: "project-85ebb717-8d08-418b-a5e",
  location: "asia-southeast1",
  processorId: "24d5014949bfd930",
};
