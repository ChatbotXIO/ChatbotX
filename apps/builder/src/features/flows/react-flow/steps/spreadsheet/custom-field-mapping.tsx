"use client"

import { spreadsheetMappingDefaultFn } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { callAPI } from "@/lib/swr"

type FieldAction = "get" | "update"

type ISpreadsheetCustomFieldMappingProps = {
  type: FieldAction
}

export const SpreadsheetCustomFieldMapping = ({
  type,
}: ISpreadsheetCustomFieldMappingProps) => {
  const t = useTranslations()
  const params = useParams<{ chatbotId: string }>()
  const { control, setValue, getValues } = useFormContext()
  const spreadsheetId = useWatch({
    control,
    name: "spreadsheetId",
  })
  const sheetName = useWatch({
    control,
    name: "sheetName",
  })
  const map = getValues("map")

  const worksheetHeadersUrl = `/api/chatbots/${params.chatbotId}/worksheet-headers?spreadsheetId=${spreadsheetId}&sheetName=${sheetName}`
  const { data: headersData } = callAPI<{ data: string[] }>(worksheetHeadersUrl)
  const headers = headersData?.data ?? []

  useEffect(() => {
    if (!map.length || map.every(({ header }: { header: string }) => !header)) {
      setValue(
        "map",
        headers.map((obj) => spreadsheetMappingDefaultFn(obj)),
      )
    }
  }, [map, headers, setValue])

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
            <CustomFieldSelect label="" name={`map.${index}.customFieldId`} />
          </div>
          <div className="w-[10%]">
            {type === "update" ? <ArrowRightIcon /> : <ArrowLeftIcon />}
          </div>
          <InputField
            className="w-full"
            disabled
            name={`map.${index}.header`}
          />
        </div>
      ))}
    </div>
  )
}
