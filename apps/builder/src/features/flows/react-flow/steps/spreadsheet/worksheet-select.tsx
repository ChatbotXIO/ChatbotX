"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

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

  const { data } = useQuery(
    orpc.spreadsheetsAPI.listWorksheetsAuthenticatedAPI.queryOptions({
      input: { workspaceId, spreadsheetId },
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
