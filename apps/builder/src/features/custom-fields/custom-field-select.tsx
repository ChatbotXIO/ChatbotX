"use client"

import { Button } from "@/components/ui/button"
import { FormItem, FormLabel } from "@/components/ui/form"
import { callAPI } from "@/lib/swr"
import type { CustomFieldType } from "@ahachat.ai/database/types"
import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { mutate } from "swr"
import { CreateCustomFieldDialog } from "./create-custom-field-dialog"
import type { CustomFieldCollection } from "./schemas"
import { SelectField } from "@/components/form/select-field"

interface ICustomFieldSelectProps {
  name: string
  label: ReactNode | string
  isRequired?: boolean
  allowCreate?: boolean
  customFieldType?: CustomFieldType
}

export const CustomFieldSelect = ({
  name,
  label = "Select Custom Field",
  isRequired = true,
  allowCreate = false,
  customFieldType,
}: ICustomFieldSelectProps) => {
  const params = useParams<{ chatbotId: string }>()

  const customFieldsUrl = `/api/chatbots/${params.chatbotId}/custom-fields?perPage=9999`
  const { data } = callAPI<CustomFieldCollection>(customFieldsUrl)
  const filterCustomFields = (data?.data ?? []).filter((obj) => {
    if (!customFieldType) {
      return true
    }

    return obj.customFieldType === customFieldType
  })
  const customFields = filterCustomFields.map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <FormItem>
      {label && label !== "" && (
        <div className="flex items-center">
          <FormLabel className="flex flex-1 gap-1 items-center">
            {label}
            {!isRequired && (
              <span className="text-xxs self-start font-normal">
                (optional)
              </span>
            )}
          </FormLabel>
          {allowCreate && (
            <CreateCustomFieldDialog
              chatbotId={params.chatbotId}
              folderId={null}
              triggerButton={
                <Button
                  variant="link"
                  className="cursor-pointer text-[12px] text-destructive p-0 h-auto"
                >
                  Add new
                </Button>
              }
              onSuccess={() => {
                mutate(customFieldsUrl)
              }}
            />
          )}
        </div>
      )}
      <SelectField
        name={name}
        placeholder="Please select"
        options={customFields}
      />
    </FormItem>
  )
}
