"use client"

import type { CustomFieldType } from "@aha.chat/database/types"
import { FieldOperationType } from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import {
  SelectField,
  type SelectOption,
} from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { FormItem, FormLabel } from "@aha.chat/ui/components/ui/form"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
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

  const getAllCustomFields = useCustomFieldStore(
    (state) => state.getAllCustomFields,
  )

  const handleSuccess = useCallback(() => {
    getAllCustomFields()
  }, [getAllCustomFields])

  const showLabel = label && label !== ""

  return (
    <FormItem>
      {showLabel && (
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
              onSuccess={handleSuccess}
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

type CustomFieldOperationSelectProps = {
  name: string
  label?: string
  required?: boolean
  customFieldType: CustomFieldType | null
}

const getOperationOptions = (
  customFieldType: CustomFieldType | null,
  t: ReturnType<typeof useTranslations>,
): SelectOption[] => {
  if (customFieldType === "shortText" || customFieldType === "longText") {
    return [
      {
        label: t("fields.customField.set_value"),
        value: FieldOperationType.set,
      },
      {
        label: t("fields.customField.append"),
        value: FieldOperationType.append,
      },
      {
        label: t("fields.customField.prepend"),
        value: FieldOperationType.prepend,
      },
    ]
  }

  if (customFieldType === "number") {
    return [
      {
        label: t("fields.customField.set_value"),
        value: FieldOperationType.set,
      },
      {
        label: t("fields.customField.increase"),
        value: FieldOperationType.increase,
      },
      {
        label: t("fields.customField.decrease"),
        value: FieldOperationType.decrease,
      },
    ]
  }

  return [
    {
      label: t("fields.customField.set_value"),
      value: FieldOperationType.set,
    },
  ]
}

export const CustomFieldOperationSelect = (
  props: CustomFieldOperationSelectProps,
) => {
  const t = useTranslations()
  const {
    label = t("fields.operation.label"),
    customFieldType,
    ...rest
  } = props

  const options = useMemo(
    () => getOperationOptions(customFieldType, t),
    [customFieldType, t],
  )

  return <SelectField label={label} options={options} {...rest} />
}
