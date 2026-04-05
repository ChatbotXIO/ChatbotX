"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useFormContext, useWatch } from "react-hook-form"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

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

  const worksheetHeadersUrl = `/api/workspaces/${workspaceId}/worksheet-headers?spreadsheetId=${spreadsheetId}&sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = (headersData?.data ?? []).map((h) => ({
    label: h,
    value: h,
  }))

  return (
    <SelectField
      label={label}
      name={getFieldName(name)}
      options={headers}
      placeholder="Please select"
    />
  )
}
