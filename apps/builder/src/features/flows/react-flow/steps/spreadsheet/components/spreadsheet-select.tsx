"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import useSWRImmutable from "swr/immutable"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"

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

  const { data } = useSWRImmutable(
    workspaceId ? ["spreadsheets", workspaceId] : null,
    () =>
      client.spreadsheetsAPI.listSpreadsheetsAuthenticatedAPI({
        workspaceId,
        perPage: maxPerPage,
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
