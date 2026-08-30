"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import useSWRImmutable from "swr/immutable"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"

type IWorksheetColumnSelectProps = {
  parentName?: string
  name: string
  label?: string
}

export const WorksheetColumnSelect = ({
  parentName,
  name,
  label = "",
}: IWorksheetColumnSelectProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const getFieldName = (field: string) => {
    if (!parentName) {
      return field
    }
    return `${parentName}.${field}`
  }

  const { control } = useFormContext()
  const spreadsheetId = useWatch({
    control,
    name: getFieldName("spreadsheetId"),
  })
  const sheetName = useWatch({
    control,
    name: getFieldName("sheetName"),
  })

  const { data: headersData } = useSWRImmutable(
    workspaceId && spreadsheetId && sheetName
      ? ["worksheet-headers", workspaceId, spreadsheetId, sheetName]
      : null,
    () =>
      client.spreadsheetsAPI.listWorksheetHeadersAuthenticatedAPI({
        workspaceId,
        spreadsheetId,
        sheetName,
      }),
  )
  const headers = (headersData?.data ?? []).map((h) => ({
    label: h,
    value: h,
  }))

  return (
    <SelectField
      label={label}
      name={getFieldName(name)}
      options={headers}
      placeholder={t("actions.pleaseSelect")}
    />
  )
}
