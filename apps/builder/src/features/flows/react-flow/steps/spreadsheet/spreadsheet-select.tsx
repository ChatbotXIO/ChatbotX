"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { FormItem, FormLabel } from "@aha.chat/ui/components/ui/form"
import { PlusIcon } from "lucide-react"
import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { mutate } from "swr"
import { CreateSpreadsheetDialog } from "@/features/spreadsheets/create-spreadsheet-dialog"
import type { SpreadsheetResource } from "@/features/spreadsheets/schemas"
import { callAPI } from "@/lib/swr"

type ISpreadsheetSelectProps = {
  name: string
  label?: ReactNode | string
  isRequired?: boolean
  allowCreate?: boolean
  onChange?: () => void
}

export const SpreadsheetSelect = ({
  name,
  label = "Select Spreadsheets",
  isRequired = true,
  allowCreate = true,
  onChange,
}: ISpreadsheetSelectProps) => {
  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/spreadsheets?perPage=9999`
  const { data, error } = callAPI<{ data: SpreadsheetResource[] }>(url)
  if (error) {
    toast.error(error)
  }
  const spreadsheets = (data?.data ?? []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <FormItem className="w-full">
      {label && label !== "" && (
        <div className="flex items-center">
          <FormLabel className="flex flex-1 items-center gap-1">
            {label}
            {!isRequired && (
              <span className="self-start font-normal text-xxs">
                (optional)
              </span>
            )}
          </FormLabel>
          {allowCreate && (
            <CreateSpreadsheetDialog
              chatbotId={params.chatbotId}
              onSuccess={() => {
                mutate(url)
              }}
              triggerButton={
                <Button
                  asChild
                  className="cursor-pointer"
                  size="sm"
                  variant="destructive"
                >
                  <PlusIcon className="text-pink-300" size={20} />
                </Button>
              }
            />
          )}
        </div>
      )}
      <SelectField
        name={name}
        onValueChange={onChange}
        options={spreadsheets}
        placeholder="Please select"
      />
    </FormItem>
  )
}
