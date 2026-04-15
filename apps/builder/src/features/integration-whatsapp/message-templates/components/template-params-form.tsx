"use client"

import {
  extractParameterInfos,
  type ParameterInfo,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { useEffect, useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type TemplateParamsFormProps = {
  components: TemplateComponent[]
  parentName: string
}

export function TemplateParamsForm({
  components,
  parentName,
}: TemplateParamsFormProps) {
  const { setValue } = useFormContext()
  const parameters = useMemo(
    () => extractParameterInfos(components),
    [components],
  )

  useEffect(() => {
    for (const param of parameters) {
      const fieldName = `${parentName}.${param.type}[${param.type === "button" ? param.buttonIndex : param.index}]`

      if (
        param.format &&
        ["image", "video", "document"].includes(param.format)
      ) {
        setValue(`${fieldName}.type`, param.format)
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
        const fieldName = `${parentName}.${param.type}[${param.type === "button" ? param.buttonIndex : param.index}]`

        if (
          param.format &&
          ["image", "video", "document"].includes(param.format)
        ) {
          return (
            <div
              className="space-y-1"
              key={`param-${param.type}-${param.format}-${param.paramName}`}
            >
              <TiptapEditorField
                name={`${fieldName}.${param.format}.link`}
                placeholder={`Enter ${param.format} URL`}
                showEmojiPicker={false}
              />
            </div>
          )
        }

        return (
          <div
            className="grid grid-cols-[90px_18px_1fr] items-start gap-2"
            key={`param-${param.type}-${param.paramName}`}
          >
            <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
              {`{{${param.paramName}}}`}
            </div>
            <div className="flex h-7 items-center justify-center text-muted-foreground">
              →
            </div>
            <TiptapEditorField
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
