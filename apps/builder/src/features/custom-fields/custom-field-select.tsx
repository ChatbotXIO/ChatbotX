"use client"

import type {
  ChannelType,
  CustomFieldType,
  SystemFieldType,
} from "@chatbotx.io/database/partials"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { FormItem, FormLabel } from "@chatbotx.io/ui/components/ui/form"
import { fieldOperationsForType } from "@chatbotx.io/utils/custom-field-operation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { CreateCustomFieldDialog } from "./create-custom-field"
import {
  useCustomFieldSelectOptions,
  useInvalidateCustomFields,
} from "./provider/custom-field-hook"

type CustomFieldSelectProps = {
  name: string
  label?: string
  required?: boolean
  allowCreate?: boolean
  customFieldTypes?: CustomFieldType[]
  includeReserved?: boolean
  channels?: ChannelType[]
  reservedFieldIds?: SystemFieldType[]
  placeholder?: string
  onValueChange?: (value: string) => void
  portal?: boolean
  createDefaultType?: CustomFieldType
  /**
   * Adds a leading "none" option (value "") so the selection can be unset. Use
   * when the field is optional and picking nothing is a valid choice.
   */
  clearable?: boolean
  /**
   * Also offers Account Fields (bot fields) in a separate group. Allowlisted
   * v1 surfaces only — see `useCustomFieldSelectOptions`.
   */
  includeBotFields?: boolean
}

// Language-neutral marker for the "no selection" option.
const CLEAR_OPTION_LABEL = "—"

export const CustomFieldSelect = (props: CustomFieldSelectProps) => {
  const t = useTranslations()
  const {
    name,
    label = t("fields.customField.label"),
    required,
    allowCreate,
    customFieldTypes,
    includeReserved = false,
    channels,
    reservedFieldIds,
    placeholder,
    onValueChange,
    portal,
    createDefaultType,
    clearable,
    includeBotFields,
  } = props

  const workspaceId = useWorkspaceId()
  const customFieldSelectOptions = useCustomFieldSelectOptions({
    customFieldTypes,
    includeReserved,
    channels,
    reservedFieldIds,
    includeBotFields,
  })

  const options = useMemo(
    () =>
      clearable
        ? [
            { label: CLEAR_OPTION_LABEL, value: "" },
            ...customFieldSelectOptions,
          ]
        : customFieldSelectOptions,
    [clearable, customFieldSelectOptions],
  )

  const invalidateCustomFields = useInvalidateCustomFields()

  const handleSuccess = useCallback(() => {
    invalidateCustomFields()
  }, [invalidateCustomFields])

  const showLabel = label && label !== ""

  return (
    <FormItem>
      {showLabel && (
        <div className="flex items-center">
          <FormLabel className="flex flex-1 items-center gap-1">
            {label}
            {!required && (
              <span className="self-start font-normal text-xxs">
                {t("fields.optionalHint")}
              </span>
            )}
          </FormLabel>

          {allowCreate && (
            <CreateCustomFieldDialog
              defaultType={createDefaultType}
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
        emptyText={t("actions.noRecordFound")}
        name={name}
        options={options}
        placeholder={placeholder || t("actions.pleaseSelect")}
        portal={portal}
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
  /** Runs in the same event as a change of the selected operation. */
  onValueChange?: (value?: string) => void
}

const OPERATION_LABEL_KEYS = {
  [FieldOperationType.set]: "set_value",
  [FieldOperationType.append]: "append",
  [FieldOperationType.prepend]: "prepend",
  [FieldOperationType.increase]: "increase",
  [FieldOperationType.decrease]: "decrease",
  [FieldOperationType.clear]: "clear",
  [FieldOperationType.formula]: "formula",
  [FieldOperationType.setNow]: "set_now",
  [FieldOperationType.dateExpression]: "date_expression",
  [FieldOperationType.addMinutes]: "add_minutes",
  [FieldOperationType.addHours]: "add_hours",
  [FieldOperationType.addDays]: "add_days",
} as const satisfies Record<FieldOperationType, string>

/** Before a field is picked only the universal `set` is offered. */
const getOperationOptions = (
  type: CustomFieldType | null,
  t: ReturnType<typeof useTranslations>,
): SelectOption[] =>
  (type ? fieldOperationsForType(type) : [FieldOperationType.set]).map(
    (operation) => ({
      label: t(`fields.customField.${OPERATION_LABEL_KEYS[operation]}`),
      value: operation,
    }),
  )

export const CustomFieldOperationSelect = (
  props: CustomFieldOperationSelectProps,
) => {
  const t = useTranslations()
  const {
    label = t("fields.operation.label"),
    type,
    onValueChange,
    ...rest
  } = props

  const options = useMemo(() => getOperationOptions(type, t), [type, t])

  return (
    <SelectField
      label={label}
      options={options}
      triggerValueChange={onValueChange}
      {...rest}
    />
  )
}
