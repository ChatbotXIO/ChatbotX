"use client"

import {
  type ButtonStepProps,
  extractParameterInfos,
  extractTemplateParams,
  type ParameterInfo,
  seedWaTemplateStepButtons,
  type TemplateComponent,
  WA_TEMPLATE_STATUS_BUTTON_COUNT,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useWhatsappInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import type { FlowTemplateResource } from "@/features/integration-whatsapp/message-templates/schema/resource"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { BaseStepEditor } from "../base/editor"
import { ButtonStepEditor } from "../button/editor"

type SendWaTemplateMessageStepEditorProps = {
  parentName: string
}

function SendWaTemplateMessageStepEditor(
  props: SendWaTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { control, getValues, setValue, unregister, watch } = useFormContext()
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
  // `fields` only changes on structural mutations (seed/reseed), never on
  // per-field edits inside a button's dialog — unlike watch(), which would
  // re-render this whole editor (and the unrelated params form and preview)
  // on every nested button change.
  const { fields: stepButtonFields } = useFieldArray({
    control,
    name: `${parentName}.buttons`,
  })
  const quickReplySlotCount = Math.max(
    0,
    stepButtonFields.length - WA_TEMPLATE_STATUS_BUTTON_COUNT,
  )
  // Keeps the leading status branches (Delivered/Failed) and reseeds the
  // quick-reply tail so each template quick reply gets a connectable handle.
  // Idempotent: seedWaTemplateStepButtons returns unchanged buttons by
  // reference, so a no-op reseed leaves the form untouched — reopening a
  // saved step never dirties it or drops edges.
  const reconcileStepButtons = useCallback(
    (components: TemplateComponent[]) => {
      const existingButtons =
        (getValues(`${parentName}.buttons`) as ButtonStepProps[]) ?? []
      const seededButtons = seedWaTemplateStepButtons(
        existingButtons,
        components,
      )
      const isUnchanged =
        seededButtons.length === existingButtons.length &&
        seededButtons.every(
          (button, index) => button === existingButtons[index],
        )
      if (isUnchanged) {
        return
      }
      setValue(`${parentName}.buttons`, seededButtons, {
        shouldDirty: true,
        shouldValidate: true,
      })
    },
    [getValues, parentName, setValue],
  )

  const resetTemplateParams = useCallback(
    (template: FlowTemplateResource) => {
      const components = template.components as TemplateComponent[]
      unregister(`${parentName}.template.params`)
      setValue(
        `${parentName}.template.params`,
        extractTemplateParams(components),
        { shouldDirty: true, shouldValidate: true },
      )
      reconcileStepButtons(components)
    },
    [parentName, reconcileStepButtons, setValue, unregister],
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
        } else {
          // Saved steps predating quick-reply seeding open without a tail;
          // reconcile on load so their quick replies gain handles too.
          reconcileStepButtons(template.components as TemplateComponent[])
        }
        const params = extractParameterInfos(
          template.components as TemplateComponent[],
        )
        setParameters(params)
      }
    }
    prevTemplateIdRef.current = templateId
  }, [
    templateId,
    whatsappTemplates,
    parentName,
    reconcileStepButtons,
    resetTemplateParams,
    setValue,
  ])

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

        {quickReplySlotCount > 0 && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: quickReplySlotCount }, (_slot, index) => (
              <ButtonStepEditor
                editorConfig={{
                  lockLabel: true,
                  hiddenButtonTypes: ["openWebsite"],
                  hideDelete: true,
                }}
                // biome-ignore lint/suspicious/noArrayIndexKey: stable seeded list
                key={index}
                parentName={`${parentName}.buttons.${WA_TEMPLATE_STATUS_BUTTON_COUNT + index}`}
              />
            ))}
          </div>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default SendWaTemplateMessageStepEditor
