export class ReceiptsError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = "RECEIPTS_ERROR") {
    super(message);
    this.name = "ReceiptsError";
    this.code = code;
  }
}

export class ConfigError extends ReceiptsError {
  /** @param {string} message */
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class QuotaError extends ReceiptsError {
  /** @param {string} message */
  constructor(message) {
    super(message, "QUOTA_ERROR");
    this.name = "QuotaError";
  }
}

export class DocumentAiError extends ReceiptsError {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 0) {
    super(message, "DOCUMENT_AI_ERROR");
    this.name = "DocumentAiError";
    this.status = status;
  }
}

/** @deprecated Use DocumentAiError */
export class VisionApiError extends DocumentAiError {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 0) {
    super(message, status);
    this.name = "VisionApiError";
    this.code = "VISION_API_ERROR";
  }
}
