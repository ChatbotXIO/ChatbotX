"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

type SpreadsheetSelectProps = {
  name: string
  label?: string
  required?: boolean
  triggerValueChange?: (value: string) => void
}

export const SpreadsheetSelect = ({
  name,
  label,
  required = true,
  triggerValueChange,
}: SpreadsheetSelectProps) => {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()

  const url = `/api/workspaces/${workspaceId}/spreadsheets?perPage=9999`
  const { data } = callAPI<{ data: { id: string; name: string }[] }>(url)
  const options = (data?.data ?? []).map((spreadsheet) => ({
    label: spreadsheet.name,
    value: spreadsheet.id,
  }))

  return (
    <ComboboxField
      emptyText={t("actions.noRecordFound")}
      label={label ?? t("fields.spreadsheets.label")}
      name={name}
      options={options}
      placeholder={t("actions.pleaseSelect")}
      popoverClassName="w-[var(--dice-anchor-width)]"
      required={required}
      triggerValueChange={triggerValueChange}
    />
  )
}
