"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { FormItem, FormLabel } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
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
  onValueChange?: (value: string) => void
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
    onValueChange,
  } = props

  const t = useTranslations()
  const workspaceId = useWorkspaceId()
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
              workspaceId={workspaceId}
            />
          )}
        </div>
      )}
      <ComboboxField
        name={name}
        options={customFieldSelectOptions}
        placeholder={placeholder || "Please select"}
        triggerValueChange={onValueChange}
      />
    </FormItem>
  )
}

type CustomFieldOperationSelectProps = {
  name: string
  label?: string
  required?: boolean
  type: CustomFieldType | null
}

const getOperationOptions = (
  type: CustomFieldType | null,
  t: ReturnType<typeof useTranslations>,
): SelectOption[] => {
  if (type === "shortText" || type === "longText") {
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

  if (type === "number") {
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
  const { label = t("fields.operation.label"), type, ...rest } = props

  const options = useMemo(() => getOperationOptions(type, t), [type, t])

  return <SelectField label={label} options={options} {...rest} />
}
