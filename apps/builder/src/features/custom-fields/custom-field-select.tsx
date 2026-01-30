"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { FieldOperationType } from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { FormItem, FormLabel } from "@aha.chat/ui/components/ui/form"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { HelpCircleIcon } from "lucide-react"
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
  allowClear?: boolean
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
  placeholder?: string
  tooltip?: string
  portal?: boolean
}

export const CustomFieldSelect = (props: CustomFieldSelectProps) => {
  const {
    name,
    label = "Select Custom Field",
    required,
    allowCreate,
    allowClear,
    customFieldTypes,
    includeReserved = false,
    placeholder,
    tooltip,
    portal,
  } = props

  const t = useTranslations()
  const params = useParams<{ chatbotId: string }>()
  const customFieldSelectOptions = useCustomFieldSelectOptions({
    customFieldTypes,
    includeReserved,
  })
  const options = useMemo(() => {
    if (!allowClear) {
      return customFieldSelectOptions
    }
    return [{ label: "---", value: "" }, ...customFieldSelectOptions]
  }, [allowClear, customFieldSelectOptions])
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
            <div className="flex items-center gap-1">
              {label}
              {tooltip && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircleIcon className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[300px]">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
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
        options={options}
        placeholder={placeholder || "Please select"}
        portal={portal}
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
  if (
    customFieldType === CustomFieldType.shortText ||
    customFieldType === CustomFieldType.longText
  ) {
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

  if (customFieldType === CustomFieldType.number) {
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
