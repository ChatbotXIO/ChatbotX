"use client"

import { spreadsheetMappingDefaultFn } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

type FieldAction = "get" | "update"

type ISpreadsheetCustomFieldMappingProps = {
  parentName?: string
  type: FieldAction
}

export const SpreadsheetCustomFieldMapping = ({
  parentName,
  type,
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
  const map = getValues(getFieldName("map"))

  const worksheetHeadersUrl = `/api/workspaces/${workspaceId}/worksheet-headers?spreadsheetId=${spreadsheetId}&sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = headersData?.data ?? []

  useEffect(() => {
    if (!map.length || map.every(({ header }: { header: string }) => !header)) {
      setValue(
        getFieldName("map"),
        headers.map((obj) => spreadsheetMappingDefaultFn(obj)),
      )
    }
  }, [map, headers, setValue, getFieldName])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <div className="w-[45%]">{t("fields.customField.label")}</div>
        <div className="w-[45%]">{t("googleSheets.header")}</div>
      </div>
      {headers.map((_header, index) => (
        <div
          className="flex items-center justify-between gap-2"
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          key={`${spreadsheetId}-${sheetName}-${index}`}
        >
          <div className="w-full">
            <CustomFieldSelect
              label=""
              name={getFieldName(`map.${index}.customFieldId`)}
            />
          </div>
          <div className="w-[10%]">
            {type === "update" ? <ArrowRightIcon /> : <ArrowLeftIcon />}
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
