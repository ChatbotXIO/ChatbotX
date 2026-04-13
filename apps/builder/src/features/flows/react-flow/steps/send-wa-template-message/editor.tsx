"use client"

import {
  extractParameterInfos,
  extractTemplateParams,
  type ParameterInfo,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useWhatsappInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import {
  type FlowTemplateResource,
  useFlowTemplate,
} from "../../stores/flow-template-store-provider"
import { BaseStepEditor } from "../base/editor"

type SendWaTemplateMessageStepEditorProps = {
  parentName: string
}

function SendWaTemplateMessageStepEditor(
  props: SendWaTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { setValue, watch } = useFormContext()
  const [selectedTemplate, setSelectedTemplate] =
    useState<FlowTemplateResource | null>(null)
  const [parameters, setParameters] = useState<ParameterInfo[]>([])
  const prevInboxIdRef = useRef<string | undefined>(undefined)

  const whatsappInboxOptions = useWhatsappInboxOptions()
  const templates = useFlowTemplate((s) => s.templates)

  const integrationInboxId = watch(`${parentName}.template.inboxId`)
  const templateId = watch(`${parentName}.template.id`)
  const templateParams = watch(`${parentName}.template.params`) || {}

  useEffect(() => {
    if (
      prevInboxIdRef.current !== undefined &&
      prevInboxIdRef.current !== integrationInboxId
    ) {
      setValue(`${parentName}.template.id`, "")
      setValue(`${parentName}.template.name`, "")
      setValue(`${parentName}.template.language`, "")
      setValue(`${parentName}.template.params`, {})
      setSelectedTemplate(null)
      setParameters([])
    }
    prevInboxIdRef.current = integrationInboxId
  }, [integrationInboxId, parentName, setValue])

  useEffect(() => {
    if (
      templateId &&
      templates.waTemplates &&
      templates.waTemplates.length > 0
    ) {
      const template = templates.waTemplates.find((t) => t.id === templateId)
      if (template) {
        setSelectedTemplate(template)
        setValue(`${parentName}.template.name`, template.name)
        setValue(`${parentName}.template.language`, template.language)
        const params = extractParameterInfos(
          template.components as TemplateComponent[],
        )
        setParameters(params)
      }
    }
  }, [templateId, templates, parentName, setValue])

  const filteredTemplates = useMemo(
    () =>
      (templates.waTemplates ?? []).filter(
        (template) =>
          template.integrationWhatsapp?.inboxId === integrationInboxId,
      ),
    [templates.waTemplates, integrationInboxId],
  )

  const handleTemplateChange = (value: string) => {
    const template = templates.waTemplates?.find((t) => t.id === value)
    if (template) {
      setValue(`${parentName}.template.id`, template.id)
      setValue(`${parentName}.template.name`, template.name)
      setValue(`${parentName}.template.language`, template.language)
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
        <ComboboxField
          name={`${parentName}.template.inboxId`}
          options={whatsappInboxOptions}
          required={true}
        />

        <Select onValueChange={handleTemplateChange} value={templateId || ""}>
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={t("flows.fields.selectTemplatePlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {filteredTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name} ({template.language})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
