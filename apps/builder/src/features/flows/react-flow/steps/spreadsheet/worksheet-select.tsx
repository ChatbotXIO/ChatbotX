"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

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

  const url = `/api/workspaces/${workspaceId}/worksheets?spreadsheetId=${spreadsheetId}`
  const { data } = callAPI<{ data: string[] }>(url)
  const worksheetOptions = (data?.data ?? []).map((v) => ({
    label: v,
    value: v,
  }))

  // const worksheetOptions = []

  // useEffect(() => {
  //   if (error || worksheets.length === 0) {
  //     toast.error("Can't find any sheet from link.")
  //   }
  // }, [error, worksheets.length])

  return (
    <SelectField
      label={label ?? t("fields.worksheet.label")}
      name={name}
      options={worksheetOptions}
      placeholder={t("actions.pleaseSelect")}
      required={required}
    />
  )
}
