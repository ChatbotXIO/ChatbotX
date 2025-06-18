"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { callAPI } from "@/lib/swr"

type WorksheetSelectProps = {
  name: string
  spreadsheetId: string
  label?: string
  isRequired?: boolean
  onChange?: (value: string) => void
}

export const WorksheetSelect = ({
  name,
  spreadsheetId,
  label = "Worksheet",
  isRequired = true,
  onChange,
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
      isRequired={isRequired}
      label={label}
      name={name}
      onValueChange={(value: string) => onChange?.(value)}
      options={worksheetOptions}
      placeholder="Please select"
    />
  )
}
