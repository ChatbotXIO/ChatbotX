"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

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

  const { data } = useQuery(
    orpc.spreadsheetsAPI.listSpreadsheetsAuthenticatedAPI.queryOptions({
      input: { workspaceId, perPage: 9999 },
    }),
  )
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
