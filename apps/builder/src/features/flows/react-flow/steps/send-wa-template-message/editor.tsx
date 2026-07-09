"use client"

import {
  extractParameterInfos,
  extractTemplateParams,
  type ParameterInfo,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useWhatsappInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import type { FlowTemplateResource } from "@/features/integration-whatsapp/message-templates/schema/resource"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { BaseStepEditor } from "../base/editor"

type SendWaTemplateMessageStepEditorProps = {
  parentName: string
}

function SendWaTemplateMessageStepEditor(
  props: SendWaTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { setValue, unregister, watch } = useFormContext()
  const [selectedTemplate, setSelectedTemplate] =
    useState<FlowTemplateResource | null>(null)
  const [parameters, setParameters] = useState<ParameterInfo[]>([])
  const prevInboxIdRef = useRef<string | undefined>(undefined)
  const prevTemplateIdRef = useRef<string | undefined>(undefined)

  const whatsappInboxOptions = useWhatsappInboxOptions()
  const whatsappTemplates = useFlowTemplate((s) => s.whatsappTemplates)

  const integrationInboxId = watch(`${parentName}.template.inboxId`)
  const templateId = watch(`${parentName}.template.id`)
  const templateParams = watch(`${parentName}.template.params`) || {}
  const resetTemplateParams = useCallback(
    (template: FlowTemplateResource) => {
      unregister(`${parentName}.template.params`)
      setValue(
        `${parentName}.template.params`,
        extractTemplateParams(template.components as TemplateComponent[]),
        { shouldDirty: true, shouldValidate: true },
      )
    },
    [parentName, setValue, unregister],
  )

  useEffect(() => {
    if (
      prevInboxIdRef.current !== undefined &&
      prevInboxIdRef.current !== integrationInboxId
    ) {
      setValue(`${parentName}.template.id`, "")
      setValue(`${parentName}.template.name`, "")
      setValue(`${parentName}.template.language`, "")
      unregister(`${parentName}.template.params`)
      setValue(`${parentName}.template.params`, {})
      setSelectedTemplate(null)
      setParameters([])
    }
    prevInboxIdRef.current = integrationInboxId
  }, [integrationInboxId, parentName, setValue, unregister])

  useEffect(() => {
    if (templateId && whatsappTemplates.length > 0) {
      const template = whatsappTemplates.find((t) => t.id === templateId)
      if (template) {
        const hasTemplateChanged =
          prevTemplateIdRef.current !== undefined &&
          prevTemplateIdRef.current !== templateId
        setSelectedTemplate(template)
        setValue(`${parentName}.template.name`, template.name)
        setValue(`${parentName}.template.language`, template.language)
        if (hasTemplateChanged) {
          resetTemplateParams(template)
        }
        const params = extractParameterInfos(
          template.components as TemplateComponent[],
        )
        setParameters(params)
      }
    }
    prevTemplateIdRef.current = templateId
  }, [templateId, whatsappTemplates, parentName, resetTemplateParams, setValue])

  const filteredTemplates = useMemo(
    () =>
      (whatsappTemplates ?? []).filter(
        (template) =>
          template.integrationWhatsapp?.inboxId === integrationInboxId,
      ),
    [whatsappTemplates, integrationInboxId],
  )

  const templateOptions = useMemo(
    () =>
      filteredTemplates.map((template) => ({
        label: `${template.name} (${template.language})`,
        value: template.id,
      })),
    [filteredTemplates],
  )

  const handleTemplateChange = (value?: string) => {
    if (!value) {
      return
    }

    const template = whatsappTemplates?.find((t) => t.id === value)
    if (template) {
      setValue(`${parentName}.template.id`, template.id)
      setValue(`${parentName}.template.name`, template.name)
      setValue(`${parentName}.template.language`, template.language)
      resetTemplateParams(template)
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
          emptyText={t("actions.noRecordFound")}
          name={`${parentName}.template.inboxId`}
          options={whatsappInboxOptions}
          placeholder={t("actions.pleaseSelect")}
          required={true}
        />

        <SelectField
          name={`${parentName}.template.id`}
          options={templateOptions}
          placeholder={t("flows.fields.selectTemplatePlaceholder")}
          triggerValueChange={handleTemplateChange}
        />

        {parameters.length > 0 && (
          <TemplateParamsForm
            components={selectedTemplate?.components as TemplateComponent[]}
            key={templateId}
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
