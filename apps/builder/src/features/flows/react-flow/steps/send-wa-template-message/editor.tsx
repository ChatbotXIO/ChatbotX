"use client"

import {
  extractParameterInfos,
  extractTemplateParams,
  type ParameterInfo,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { getTemplatesForFlow } from "@/features/integration-whatsapp/message-templates/actions/get-templates-for-flow"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import { useFlowAction } from "../../stores/flow-action-store-provider"
import { BaseStepEditor } from "../base/editor"

type Template = {
  id: string
  name: string
  language: string
  components: TemplateComponent[]
}

type SendWaTemplateMessageStepEditorProps = {
  parentName: string
}

function SendWaTemplateMessageStepEditor(
  props: SendWaTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { setValue, watch } = useFormContext()
  const workspaceId = useFlowAction((s) => s.workspaceId)

  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  )
  const [parameters, setParameters] = useState<ParameterInfo[]>([])

  const templateId = watch(`${parentName}.template.id`)
  const templateParams = watch(`${parentName}.template.params`) || {}

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!workspaceId) {
        return
      }
      try {
        const data = await getTemplatesForFlow(workspaceId)
        setTemplates(data as Template[])
      } catch (error) {
        console.error("Failed to fetch templates:", error)
      }
    }
    fetchTemplates()
  }, [workspaceId])

  useEffect(() => {
    if (templateId && templates.length > 0) {
      const template = templates.find((t) => t.id === templateId)
      if (template) {
        setSelectedTemplate(template)
        const params = extractParameterInfos(
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
      const initialParams = extractTemplateParams(
        template.components as TemplateComponent[],
      )
      setValue(`${parentName}.template.params`, initialParams)
      setSelectedTemplate(template)
      const params = extractParameterInfos(
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
          <TemplateParamsForm
            components={selectedTemplate?.components as TemplateComponent[]}
            parentName={`${parentName}.template.params`}
          />
        )}

        {selectedTemplate && (
          <div className="mt-4">
            <div className="mb-2 font-medium text-xs">
              {t("flows.fields.preview")}
            </div>
            <TemplatePreview
              bodyParams={templateParams.body || []}
              buttonParams={templateParams.button || []}
              components={selectedTemplate.components as TemplateComponent[]}
              headerParams={templateParams.header || []}
            />
          </div>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default SendWaTemplateMessageStepEditor
