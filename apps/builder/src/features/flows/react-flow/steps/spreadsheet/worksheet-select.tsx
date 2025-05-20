"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { callAPI } from "@/lib/swr"

type IWorksheetSelectProps = {
  label?: string
  isRequired?: boolean
  onChange?: (value: string) => void
}

export const WorksheetSelect = ({
  label = "Worksheet",
  isRequired = true,
  onChange,
}: IWorksheetSelectProps) => {
  const params = useParams<{ chatbotId: string }>()
  const { control } = useFormContext()
  const spreadsheetId = useWatch({
    control,
    name: "spreadsheetId",
  })

  const url = `/api/chatbots/${params.chatbotId}/worksheets?spreadsheetId=${spreadsheetId}`
  const { data, error } = callAPI<{ data: string[] }>(url)
  const worksheets = (data?.data ?? []).map((v) => ({
    label: v,
    value: v,
  }))

  useEffect(() => {
    if (error || worksheets.length === 0) {
      toast.error("Can't find any sheet from link.")
    }
  }, [error, worksheets.length])

  return (
    <SelectField
      isRequired={isRequired}
      label={label}
      name="sheetName"
      onValueChange={(value: string) => onChange?.(value)}
      options={worksheets}
      placeholder="Please select"
    />
  )
}
