"use client"

import {
  spreadsheetContactToSheetMappingDefaultFn,
  spreadsheetSheetToContactMappingDefaultFn,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

type SpreadsheetMappingDirection = "sheetToContact" | "contactToSheet"

type SpreadsheetMappingEntry = {
  header?: string
  value?: string
  customFieldId?: string
}

type ISpreadsheetCustomFieldMappingProps = {
  parentName?: string
  direction: SpreadsheetMappingDirection
}

export const SpreadsheetCustomFieldMapping = ({
  direction,
  parentName,
}: ISpreadsheetCustomFieldMappingProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const getFieldName = useCallback(
    (field: string) => {
      if (!parentName) {
        return field
      }
      return `${parentName}.${field}`
    },
    [parentName],
  )

  const { control, setValue, getValues } = useFormContext()

  const spreadsheetId = useWatch({
    control,
    name: getFieldName("spreadsheetId"),
  })
  const sheetName = useWatch({
    control,
    name: getFieldName("sheetName"),
  })
  const mapValue: SpreadsheetMappingEntry[] =
    useWatch({ control, name: getFieldName("map") }) ?? []

  const worksheetHeadersUrl = `/api/workspaces/${workspaceId}/worksheets/${spreadsheetId}/headers?sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = headersData?.data ?? []
  // Only trust the "header missing" signal once the live headers have loaded,
  // otherwise the saved mappings would flash a red border before data arrives.
  const isHeadersLoaded = Array.isArray(headersData?.data)

  // Reconcile the saved mapping against the sheet's live headers: every current
  // column gets a row (adding newly-created ones, preserving values by header
  // name), and mappings whose column no longer exists are kept at the end so the
  // user still sees them (flagged below) instead of losing them silently.
  useEffect(() => {
    if (!isHeadersLoaded) {
      return
    }
    const currentMap: SpreadsheetMappingEntry[] =
      getValues(getFieldName("map")) ?? []
    const savedByHeader = new Map(
      currentMap
        .filter((entry) => entry.header)
        .map((entry) => [entry.header as string, entry]),
    )
    const liveEntries = headers.map(
      (header) =>
        savedByHeader.get(header) ??
        (direction === "sheetToContact"
          ? spreadsheetSheetToContactMappingDefaultFn(header)
          : spreadsheetContactToSheetMappingDefaultFn(header)),
    )
    const orphanEntries = currentMap.filter(
      (entry) => !(entry.header && headers.includes(entry.header)),
    )
    const reconciled = [...liveEntries, ...orphanEntries]
    // Skip the write when nothing changed to avoid a re-render loop and to keep
    // focus/caret stable while the user is typing.
    if (JSON.stringify(reconciled) !== JSON.stringify(currentMap)) {
      setValue(getFieldName("map"), reconciled)
    }
  }, [direction, isHeadersLoaded, headers, setValue, getValues, getFieldName])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <div className="w-[45%]">
          {direction === "sheetToContact"
            ? t("fields.customField.label")
            : t("fields.value.label")}
        </div>
        <div className="w-[45%]">{t("googleSheets.header")}</div>
      </div>
      {mapValue.map((entry, index) => {
        const header = entry?.header ?? ""
        // The saved header no longer exists in the current sheet: keep showing
        // it (so nothing is lost) but flag it so the user knows to fix it.
        const isHeaderMissing =
          isHeadersLoaded && header.length > 0 && !headers.includes(header)
        return (
          <div
            className="flex items-center justify-between gap-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: mapping rows are position-bound
            key={`${spreadsheetId}-${sheetName}-${index}`}
          >
            <div className="w-full">
              {direction === "sheetToContact" ? (
                <CustomFieldSelect
                  clearable
                  label=""
                  name={getFieldName(`map.${index}.customFieldId`)}
                />
              ) : (
                <PlainTextEditorField
                  includeRawCustomFieldVariables
                  inline
                  label=""
                  name={getFieldName(`map.${index}.value`)}
                  placeholder={t("actions.enterText")}
                  showEmojiPicker={false}
                />
              )}
            </div>
            <div className="w-[10%]">
              {direction === "contactToSheet" ? (
                <ArrowRightIcon className="rtl:rotate-180" />
              ) : (
                <ArrowLeftIcon className="rtl:rotate-180" />
              )}
            </div>
            <InputField
              aria-invalid={isHeaderMissing}
              className={`w-full ${isHeaderMissing ? "border-destructive" : ""}`}
              disabled
              name={getFieldName(`map.${index}.header`)}
            />
          </div>
        )
      })}
    </div>
  )
}
