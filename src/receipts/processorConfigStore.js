import { DEFAULT_PROCESSOR_CONFIG, PROCESSOR_CONFIG_STORAGE_KEY } from "./config.js";

/**
 * @typedef {{ projectId: string, location: string, processorId: string }} ProcessorConfig
 */

/**
 * @param {unknown} value
 * @returns {ProcessorConfig}
 */
function normalizeConfig(value) {
  const raw = value && typeof value === "object" ? value : {};
  const projectId = String(raw.projectId || "").trim();
  const location = String(raw.location || "").trim();
  const processorId = String(raw.processorId || "").trim();
  return {
    projectId: projectId || DEFAULT_PROCESSOR_CONFIG.projectId,
    location: location || DEFAULT_PROCESSOR_CONFIG.location,
    processorId: processorId || DEFAULT_PROCESSOR_CONFIG.processorId,
  };
}

/**
 * @returns {ProcessorConfig}
 */
export function getProcessorConfig() {
  try {
    const raw = localStorage.getItem(PROCESSOR_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROCESSOR_CONFIG };
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROCESSOR_CONFIG };
  }
}

/**
 * @param {Partial<ProcessorConfig>} config
 * @returns {ProcessorConfig}
 */
export function setProcessorConfig(config) {
  const next = normalizeConfig({ ...getProcessorConfig(), ...config });
  localStorage.setItem(PROCESSOR_CONFIG_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearProcessorConfig() {
  localStorage.removeItem(PROCESSOR_CONFIG_STORAGE_KEY);
}

/**
 * @param {ProcessorConfig} config
 * @returns {boolean}
 */
export function isProcessorConfigComplete(config) {
  return Boolean(config?.projectId && config?.location && config?.processorId);
}
