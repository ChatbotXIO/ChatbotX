"use client"

import type { ParameterInfo } from "@chatbotx.io/flow-config"
import {
  extractMessengerParameterInfos,
  type MessengerTemplateComponent,
} from "@chatbotx.io/flow-config"
import { useEffect, useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type MessengerTemplateParamsFormProps = {
  components: MessengerTemplateComponent[]
  parentName: string
  parameterFormat?: "POSITIONAL" | "NAMED"
}

function getFieldName(param: ParameterInfo, parentName: string): string {
  if (param.type === "button") {
    return `${parentName}.button[${param.buttonIndex}]`
  }
  return `${parentName}.${param.type}[${param.index}]`
}

function ButtonParamField({
  param,
  fieldName,
}: {
  param: ParameterInfo
  fieldName: string
}) {
  if (param.buttonSubType === "url") {
    return (
      <div className="grid grid-cols-[90px_18px_1fr] items-start gap-2">
        <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
          {`{{${param.paramName}}}`}
        </div>
        <div className="flex h-7 items-center justify-center text-muted-foreground">
          →
        </div>
        <TiptapEditorField
          channels={["messenger"]}
          name={`${fieldName}.text`}
          placeholder=""
          showEmojiPicker={false}
        />
      </div>
    )
  }

  // POSTBACK params are no longer generated (handled as flow buttons instead)
  return null
}

export function MessengerTemplateParamsForm({
  components,
  parentName,
  parameterFormat = "POSITIONAL",
}: MessengerTemplateParamsFormProps) {
  const { setValue } = useFormContext()
  const parameters = useMemo(
    () => extractMessengerParameterInfos(components, parameterFormat),
    [components, parameterFormat],
  )

  useEffect(() => {
    for (const param of parameters) {
      const fieldName = getFieldName(param, parentName)

      if (param.type === "button") {
        // Only URL buttons remain as params; POSTBACK buttons are now flow buttons.
        if (param.buttonSubType === "url") {
          setValue(`${fieldName}.sub_type`, "url")
          setValue(`${fieldName}.index`, param.buttonIndex)
        }
      } else {
        setValue(`${fieldName}.type`, "text")
      }
    }
  }, [parameters, parentName, setValue])

  if (parameters.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {parameters.map((param: ParameterInfo) => {
        const fieldName = getFieldName(param, parentName)
        const key = `param-${param.type}-${param.format ?? ""}-${param.paramName}-${param.buttonIndex ?? ""}`

        if (param.type === "button") {
          return (
            <ButtonParamField fieldName={fieldName} key={key} param={param} />
          )
        }

        // text parameter (header or body)
        const label =
          parameterFormat === "NAMED"
            ? param.paramName
            : `{{${param.paramName}}}`

        return (
          <div
            className="grid grid-cols-[90px_18px_1fr] items-start gap-2"
            key={key}
          >
            <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
              {label}
            </div>
            <div className="flex h-7 items-center justify-center text-muted-foreground">
              →
            </div>
            <TiptapEditorField
              channels={["messenger"]}
              name={`${fieldName}.text`}
              placeholder=""
              showEmojiPicker={false}
            />
          </div>
        )
      })}
    </div>
  )
}
