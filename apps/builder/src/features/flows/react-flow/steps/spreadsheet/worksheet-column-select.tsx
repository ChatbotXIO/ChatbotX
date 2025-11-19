"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useFormContext, useWatch } from "react-hook-form"
import { callAPI } from "@/lib/swr"

type IWorksheetColumnSelectProps = {
  name: string
  label?: string
}

export const WorksheetColumnSelect = ({
  name,
  label = "",
}: IWorksheetColumnSelectProps) => {
  const params = useParams<{ chatbotId: string }>()
  const { control } = useFormContext()
  const spreadsheetId = useWatch({
    control,
    name: "spreadsheetId",
  })
  const sheetName = useWatch({
    control,
    name: "sheetName",
  })

  const worksheetHeadersUrl = `/api/chatbots/${params.chatbotId}/worksheet-headers?spreadsheetId=${spreadsheetId}&sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = (headersData?.data ?? []).map((h) => ({
    label: h,
    value: h,
  }))

  return (
    <SelectField
      label={label}
      name={name}
      options={headers}
      placeholder="Please select"
    />
  )
}
