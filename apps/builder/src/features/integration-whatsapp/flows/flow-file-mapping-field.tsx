"use client"

import {
  WHATSAPP_FLOW_FILE_ANSWER_FIELD_TYPES,
  type WhatsappFlowFileFormat,
  whatsappFlowFileFormats,
} from "@chatbotx.io/flow-config"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

/** The fields a file answer can be mapped to (a mutable copy for the picker's prop). */
export const FILE_ANSWER_CUSTOM_FIELD_TYPES = [
  ...WHATSAPP_FLOW_FILE_ANSWER_FIELD_TYPES,
]

const fileFormatLabelKeys = {
  allUrls: "flows.whatsappFlow.fileFormatAllUrls",
  firstUrl: "flows.whatsappFlow.fileFormatFirstUrl",
} as const satisfies Record<WhatsappFlowFileFormat, string>

/** Marks a Flow answer that is a list of uploaded files. */
export function FlowFileAnswerBadge() {
  const t = useTranslations()
  return <Badge variant="secondary">{t("flows.whatsappFlow.fileBadge")}</Badge>
}

/**
 * How a file answer is written to its custom field. Shared by the step's
 * dialog and the template form, whose mapping rows differ; `mappingName` is
 * the row's form path (`flow.fieldMappings.0`).
 */
export function FlowFileMappingField({ mappingName }: { mappingName: string }) {
  const t = useTranslations()
  const options: SelectOption[] = useMemo(
    () =>
      whatsappFlowFileFormats.options.map((format) => ({
        label: t(fileFormatLabelKeys[format]),
        value: format,
      })),
    [t],
  )

  return (
    <SelectField
      description={t("flows.whatsappFlow.fileFormatHint")}
      label={t("flows.whatsappFlow.fileFormat")}
      name={`${mappingName}.fileFormat`}
      options={options}
    />
  )
}
