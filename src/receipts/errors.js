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

export class VisionApiError extends ReceiptsError {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 0) {
    super(message, "VISION_API_ERROR");
    this.name = "VisionApiError";
    this.status = status;
  }
}
