export class NewsError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "NewsError";
    this.code = code;
  }
}

export class ValidationError extends NewsError {
  constructor(message) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class ConfigError extends NewsError {
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class AuthError extends NewsError {
  constructor(message, status) {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
    this.status = status;
  }
}

export class RateLimitError extends NewsError {
  constructor(message, status) {
    super(message, "RATE_LIMIT_ERROR");
    this.name = "RateLimitError";
    this.status = status;
  }
}

export class TimeoutError extends NewsError {
  constructor(message) {
    super(message, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

export class UpstreamError extends NewsError {
  constructor(message, status) {
    super(message, "UPSTREAM_ERROR");
    this.name = "UpstreamError";
    this.status = status;
  }
}
