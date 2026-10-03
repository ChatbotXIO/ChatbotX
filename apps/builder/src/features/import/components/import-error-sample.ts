import type { ImportErrorSample } from "@chatbotx.io/database/schema"

type ImportErrorSampleTranslation = (
  key:
    | "fields.import.histories.unsupportedChannelStep"
    | "fields.import.histories.channelStepConstraintExceeded"
    | "fields.import.histories.channelStepConstraintExceededGeneric",
  values: Record<string, number | string>,
) => string

export const getImportErrorSampleDescription = (
  error: ImportErrorSample,
  t: ImportErrorSampleTranslation,
): string => {
  const capability = error.capability
  if (!capability) {
    return error.reason
  }

  if (capability.code === "unsupportedBlock") {
    return t("fields.import.histories.unsupportedChannelStep", {
      block: capability.block,
      channel: capability.channel,
    })
  }

  if (
    capability.actual === undefined ||
    capability.allowed === undefined ||
    !capability.unit
  ) {
    return t("fields.import.histories.channelStepConstraintExceededGeneric", {
      block: capability.block,
      channel: capability.channel,
    })
  }

  return t("fields.import.histories.channelStepConstraintExceeded", {
    actual: capability.actual,
    allowed: capability.allowed,
    block: capability.block,
    channel: capability.channel,
    unit: capability.unit,
  })
}

export const getImportErrorSampleKey = (
  error: ImportErrorSample,
  index: number,
): string =>
  [error.path ?? error.row ?? "import", error.code ?? error.reason, index].join(
    ":",
  )
