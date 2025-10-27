"use client"

import type { CustomFieldType } from "@aha.chat/database/types"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { FormItem, FormLabel } from "@aha.chat/ui/components/ui/form"
import { useParams } from "next/navigation"
import { mutate } from "swr"
import { callAPI } from "@/lib/swr"
import { CreateCustomFieldDialog } from "./create-custom-field-dialog"
import type { CustomFieldCollection } from "./schemas"

type CustomFieldSelectProps = {
  name: string
  label?: string
  required?: boolean
  allowCreate?: boolean
  customFieldType?: CustomFieldType
}

export const CustomFieldSelect = (props: CustomFieldSelectProps) => {
  const {
    name,
    label = "Select Custom Field",
    required,
    allowCreate,
    customFieldType,
  } = props

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
          <FormLabel className="flex flex-1 items-center gap-1">
            {label}
            {!required && (
              <span className="self-start font-normal text-xxs">
                (optional)
              </span>
            )}
          </FormLabel>
          {allowCreate && (
            <CreateCustomFieldDialog
              chatbotId={params.chatbotId}
              folderId={null}
              onSuccess={() => {
                mutate(customFieldsUrl)
              }}
              triggerButton={
                <Button
                  className="h-auto cursor-pointer p-0 text-[12px] text-destructive"
                  variant="link"
                >
                  Add new
                </Button>
              }
            />
          )}
        </div>
      )}
      <SelectField
        name={name}
        options={customFields}
        placeholder="Please select"
      />
    </FormItem>
  )
}
