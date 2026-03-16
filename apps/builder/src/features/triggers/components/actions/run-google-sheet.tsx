import { StepType } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useFormContext } from "react-hook-form"
import { SpreadsheetColumnFilter } from "@/features/flows/react-flow/steps/spreadsheet/components/spreadsheet-column-filter"
import { SpreadsheetSelect } from "@/features/flows/react-flow/steps/spreadsheet/components/spreadsheet-select"
import { SpreadsheetCustomFieldMapping } from "@/features/flows/react-flow/steps/spreadsheet/custom-field-mapping"
import { WorksheetSelect } from "@/features/flows/react-flow/steps/spreadsheet/worksheet-select"

export const GoogleSheetAction = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const isFirstRender = useRef(true)

  const getFieldName = useCallback(
    (field: string) => {
      if (!parentName) {
        return field
      }
      return `${parentName}.${field}`
    },
    [parentName],
  )

  const { watch, resetField, setValue } = useFormContext()
  const action = watch(getFieldName("action"))
  const spreadsheetId = watch(getFieldName("spreadsheetId"))
  const sheetName = watch(getFieldName("sheetName"))

  const actionOptions = useMemo(
    () => [
      {
        label: t("flows.actions.spreadsheetGetRow"),
        value: StepType.spreadsheetGetRow,
      },
      {
        label: t("flows.actions.spreadsheetGetRandomRow"),
        value: StepType.spreadsheetGetRandomRow,
      },
      {
        label: t("flows.actions.spreadsheetUpdateRow"),
        value: StepType.spreadsheetUpdateRow,
      },
      {
        label: t("flows.actions.spreadsheetSendData"),
        value: StepType.spreadsheetSendData,
      },
      {
        label: t("flows.actions.spreadsheetClearRow"),
        value: StepType.spreadsheetClearRow,
      },
    ],
    [t],
  )

  const onChangeSpreadsheet = useCallback(() => {
    resetField(getFieldName("map"))
    resetField(getFieldName("sheetName"))
  }, [resetField, getFieldName])

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setValue(getFieldName("spreadsheetId"), "")
  }, [action, setValue, getFieldName])

  return (
    <div className="flex flex-col gap-4">
      <SelectField name={getFieldName("action")} options={actionOptions} />
      <SpreadsheetSelect
        name={getFieldName("spreadsheetId")}
        triggerValueChange={onChangeSpreadsheet}
      />
      {spreadsheetId && (
        <WorksheetSelect
          name={getFieldName("sheetName")}
          spreadsheetId={spreadsheetId}
        />
      )}
      {spreadsheetId && sheetName && (
        <SpreadsheetColumnFilter parentName={parentName} />
      )}
      {spreadsheetId &&
        sheetName &&
        action !== StepType.spreadsheetClearRow && (
          <SpreadsheetCustomFieldMapping
            parentName={parentName}
            type={
              action === StepType.spreadsheetGetRow ||
              action === StepType.spreadsheetGetRandomRow
                ? "get"
                : "update"
            }
          />
        )}
    </div>
  )
}
