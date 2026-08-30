"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import useSWRImmutable from "swr/immutable"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"

type WorksheetSelectProps = {
  name: string
  spreadsheetId: string
  label?: string
  required?: boolean
}

export const WorksheetSelect = ({
  name,
  spreadsheetId,
  label,
  required = true,
}: WorksheetSelectProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { data } = useSWRImmutable(
    workspaceId && spreadsheetId
      ? ["worksheets", workspaceId, spreadsheetId]
      : null,
    () =>
      client.spreadsheetsAPI.listWorksheetsAuthenticatedAPI({
        workspaceId,
        spreadsheetId,
      }),
  )
  const worksheetOptions = (data?.data ?? []).map((sheet) => ({
    label: sheet,
    value: sheet,
  }))

  return (
    <ComboboxField
      emptyText={t("actions.noRecordFound")}
      label={label ?? t("fields.worksheet.label")}
      name={name}
      options={worksheetOptions}
      placeholder={t("actions.pleaseSelect")}
      popoverClassName="w-[var(--dice-anchor-width)]"
      required={required}
    />
  )
}
