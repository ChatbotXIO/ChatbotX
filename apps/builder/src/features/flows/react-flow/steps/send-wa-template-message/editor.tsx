"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { getTemplatesForFlow } from "@/features/integration-whatsapp/message-templates/actions/get-templates-for-flow"
import { useFlowAction } from "../../stores/flow-action-store-provider"
import { BaseStepEditor } from "../base/editor"

type TemplateComponent = {
  type: string
  format?: string
  text?: string
  example?: unknown
  url?: string
  buttons?: Array<{
    type: string
    text: string
    url?: string
    example?: string[]
  }>
}

type Template = {
  id: string
  name: string
  language: string
  components: TemplateComponent[]
}

type ParameterInfo = {
  type: "header" | "body" | "button"
  index: number
  paramName: string
  format?: string
  buttonIndex?: number
}

const extractParameters = (
  components: TemplateComponent[],
): ParameterInfo[] => {
  const params: ParameterInfo[] = []

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          for (const [idx, match] of matches.entries()) {
            const paramName = match.replace(/\{\{|\}\}/g, "")
            params.push({
              type: "header",
              index: idx,
              paramName,
              format: "text",
            })
          }
        }
      } else if (
        ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format || "")
      ) {
        params.push({
          type: "header",
          index: 0,
          paramName: "1",
          format: component.format?.toLowerCase(),
        })
      }
    } else if (component.type === "BODY" && component.text) {
      const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
      if (matches) {
        for (const [idx, match] of matches.entries()) {
          const paramName = match.replace(/\{\{|\}\}/g, "")
          params.push({
            type: "body",
            index: idx,
            paramName,
          })
        }
      }
    } else if (component.type === "BUTTONS" && component.buttons) {
      for (const [buttonIdx, button] of component.buttons.entries()) {
        if (button.type === "URL" && button.url?.includes("{{1}}")) {
          params.push({
            type: "button",
            index: 0,
            paramName: "1",
            buttonIndex: buttonIdx,
          })
        }
      }
    }
  }

  return params
}

const renderPreview = (
  components: TemplateComponent[],
  headerParams: Array<{ text?: string; image?: { link: string } }>,
  bodyParams: Array<{ text?: string }>,
  buttonParams: Array<{ text?: string }>,
) => {
  return components.map((component) => {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        let text = component.text
        if (headerParams && headerParams.length > 0) {
          for (const [i, param] of headerParams.entries()) {
            if (param?.text) {
              text = text.replace(`{{${i + 1}}}`, param.text)
              text = text.replace(/\{\{[a-zA-Z_]+\}\}/g, param.text)
            }
          }
        }
        return (
          <div
            className="font-bold text-sm"
            key={`header-text-${component.type}`}
          >
            {text}
          </div>
        )
      }
      if (component.format === "IMAGE" && headerParams?.[0]?.image?.link) {
        let imageUrl: URL | null = null
        try {
          imageUrl = new URL(headerParams[0].image.link)
        } catch {
          imageUrl = null
        }

        return (
          <div className="mb-2" key={`header-image-${component.type}`}>
            {imageUrl ? (
              <div className="relative h-32 w-full">
                <Image
                  alt="Header preview"
                  className="h-full w-full rounded object-contain object-left"
                  fill={true}
                  src={imageUrl.toString()}
                />
              </div>
            ) : (
              <div className="rounded border bg-muted px-2 py-1 text-muted-foreground text-xs">
                {headerParams[0].image.link}
              </div>
            )}
          </div>
        )
      }
    }
    if (component.type === "BODY" && component.text) {
      let text = component.text
      if (bodyParams && bodyParams.length > 0) {
        for (const [i, param] of bodyParams.entries()) {
          if (param?.text) {
            text = text.replace(`{{${i + 1}}}`, param.text)
            text = text.replace(/\{\{[a-zA-Z_]+\}\}/g, param.text)
          }
        }
      }
      return (
        <div
          className="whitespace-pre-wrap text-sm"
          key={`body-${component.type}`}
        >
          {text}
        </div>
      )
    }
    if (component.type === "FOOTER" && component.text) {
      return (
        <div
          className="mt-2 text-muted-foreground text-xs"
          key={`footer-${component.type}`}
        >
          {component.text}
        </div>
      )
    }
    if (component.type === "BUTTONS" && component.buttons) {
      return (
        <div className="mt-2 space-y-1" key={`buttons-${component.type}`}>
          {component.buttons.map((button, btnIdx) => {
            let url = button.url || ""
            if (
              button.type === "URL" &&
              url.includes("{{1}}") &&
              buttonParams?.[btnIdx]?.text
            ) {
              url = url.replace("{{1}}", buttonParams[btnIdx].text)
            }
            return (
              <div
                className="rounded border bg-gray-300 px-2 py-1 text-center text-blue-600 text-xs"
                key={`button-${btnIdx}-${button.text}`}
              >
                {button.text} {url && `→ ${url}`}
              </div>
            )
          })}
        </div>
      )
    }
    return null
  })
}

type SendWaTemplateMessageStepEditorProps = {
  parentName: string
}

function SendWaTemplateMessageStepEditor(
  props: SendWaTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { setValue, watch, register } = useFormContext()
  const chatbotId = useFlowAction((s) => s.chatbotId)

  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  )
  const [parameters, setParameters] = useState<ParameterInfo[]>([])

  const templateId = watch(`${parentName}.template.id`)
  const templateParams = watch(`${parentName}.template.params`) || {}

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!chatbotId) {
        return
      }
      try {
        const data = await getTemplatesForFlow(chatbotId)
        setTemplates(data as Template[])
      } catch (error) {
        console.error("Failed to fetch templates:", error)
      }
    }
    fetchTemplates()
  }, [chatbotId])

  useEffect(() => {
    if (templateId && templates.length > 0) {
      const template = templates.find((t) => t.id === templateId)
      if (template) {
        setSelectedTemplate(template)
        const params = extractParameters(
          template.components as TemplateComponent[],
        )
        setParameters(params)
      }
    }
  }, [templateId, templates])

  const handleTemplateChange = (value: string) => {
    const template = templates.find((t) => t.id === value)
    if (template) {
      setValue(`${parentName}.template.id`, template.id)
      setValue(`${parentName}.template.name`, template.name)
      setValue(`${parentName}.template.languageCode`, template.language)
      setValue(`${parentName}.template.params`, {})
      setSelectedTemplate(template)
      const params = extractParameters(
        template.components as TemplateComponent[],
      )
      setParameters(params)
    }
  }

  return (
    <BaseStepEditor>
      <div className="space-y-3">
        <div>
          <Select onValueChange={handleTemplateChange} value={templateId}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t("flows.fields.selectTemplatePlaceholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} ({template.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {parameters.length > 0 && (
          <div className="space-y-2">
            {parameters.map((param) => {
              const fieldName = `${parentName}.template.params.${param.type}[${param.type === "button" ? param.buttonIndex : param.index}]`

              if (
                param.format &&
                ["image", "video", "document"].includes(param.format)
              ) {
                return (
                  <div
                    className="space-y-1"
                    key={`param-${param.type}-${param.format}-${param.paramName}`}
                  >
                    <input
                      type="hidden"
                      {...register(`${fieldName}.type`)}
                      value={param.format}
                    />
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
                  {param.type === "header" && (
                    <input
                      type="hidden"
                      {...register(`${fieldName}.type`)}
                      value="text"
                    />
                  )}
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
        )}

        {selectedTemplate && (
          <div className="mt-4">
            <div className="mb-2 font-medium text-xs">
              {t("flows.fields.preview")}
            </div>
            <div className="space-y-2 rounded-lg bg-gray-100 p-3">
              {renderPreview(
                selectedTemplate.components as TemplateComponent[],
                templateParams.header || [],
                templateParams.body || [],
                templateParams.button || [],
              )}
            </div>
          </div>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default SendWaTemplateMessageStepEditor
