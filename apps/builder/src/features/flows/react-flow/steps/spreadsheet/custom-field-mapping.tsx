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
  const map = getValues(getFieldName("map")) ?? []

  const worksheetHeadersUrl = `/api/workspaces/${workspaceId}/worksheets/${spreadsheetId}/headers?sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = headersData?.data ?? []

  useEffect(() => {
    if (!map.length || map.every(({ header }: { header: string }) => !header)) {
      setValue(
        getFieldName("map"),
        headers.map((header) =>
          direction === "sheetToContact"
            ? spreadsheetSheetToContactMappingDefaultFn(header)
            : spreadsheetContactToSheetMappingDefaultFn(header),
        ),
      )
    }
  }, [direction, map, headers, setValue, getFieldName])

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
      {headers.map((_header, index) => (
        <div
          className="flex items-center justify-between gap-2"
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          key={`${spreadsheetId}-${sheetName}-${index}`}
        >
          <div className="w-full">
            {direction === "sheetToContact" ? (
              <CustomFieldSelect
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
            className="w-full"
            disabled
            name={getFieldName(`map.${index}.header`)}
          />
        </div>
      ))}
    </div>
  )
}
