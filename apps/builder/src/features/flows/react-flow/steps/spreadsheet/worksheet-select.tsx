"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
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
  label = "Worksheet",
  required = true,
}: WorksheetSelectProps) => {
  const params = useParams<{ chatbotId: string }>()
  // const { control } = useFormContext()

  const url = `/api/chatbots/${params.chatbotId}/worksheets?spreadsheetId=${spreadsheetId}`
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
      label={label}
      name={name}
      options={worksheetOptions}
      placeholder="Please select"
      required={required}
    />
  )
}
