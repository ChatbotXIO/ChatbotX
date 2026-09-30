import type { ImportErrorSample } from "@chatbotx.io/database/schema"

export const getImportErrorSampleDescription = (
  error: ImportErrorSample,
): string => {
  const capability = error.capability
  if (!capability) {
    return error.reason
  }

  if (capability.code === "unsupportedBlock") {
    return `The ${capability.channel} channel does not support ${capability.block}.`
  }

  const unit = capability.unit ?? "items"
  const constraint = capability.constraintId ?? "limit"
  return `${capability.block} exceeds the ${capability.channel} ${constraint}: ${capability.actual ?? "unknown"} ${unit}, maximum ${capability.allowed ?? "unknown"}.`
}

export const getImportErrorSampleKey = (
  error: ImportErrorSample,
  index: number,
): string =>
  [error.path ?? error.row ?? "import", error.code ?? error.reason, index].join(
    ":",
  )
