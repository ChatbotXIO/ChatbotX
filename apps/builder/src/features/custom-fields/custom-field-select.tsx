"use client"

import type { CustomFieldType } from "@aha.chat/database/types"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { FormItem, FormLabel } from "@aha.chat/ui/components/ui/form"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { CreateCustomFieldDialog } from "./create-custom-field"
import { useCustomFieldSelectOptions } from "./provider/custom-field-hook"
import { useCustomFieldStore } from "./provider/custom-field-store-context"

type CustomFieldSelectProps = {
  name: string
  label?: string
  required?: boolean
  allowCreate?: boolean
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
  placeholder?: string
}

export const CustomFieldSelect = (props: CustomFieldSelectProps) => {
  const {
    name,
    label = "Select Custom Field",
    required,
    allowCreate,
    customFieldTypes,
    includeReserved = false,
    placeholder,
  } = props

  const t = useTranslations()

  const params = useParams<{ chatbotId: string }>()
  const customFieldSelectOptions = useCustomFieldSelectOptions({
    customFieldTypes,
    includeReserved,
  })
  const { getAllCustomFields } = useCustomFieldStore((state) => state)

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
                getAllCustomFields(params.chatbotId)
              }}
              triggerButton={
                <Button
                  className="h-auto cursor-pointer p-0 text-[12px] text-destructive"
                  variant="link"
                >
                  {t("actions.add")}
                </Button>
              }
            />
          )}
        </div>
      )}
      <ComboboxField
        name={name}
        options={customFieldSelectOptions}
        placeholder={placeholder || "Please select"}
      />
    </FormItem>
  )
}
