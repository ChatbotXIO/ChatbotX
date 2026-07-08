"use client"

import {
  type ButtonStepProps,
  extractMessengerFlowButtons,
  extractMessengerParameterInfos,
  extractMessengerTemplateParams,
  type MessengerTemplateComponent,
  mergeMessengerFlowButtonsWithExisting,
  type ParameterInfo,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useMessengerInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { MessengerTemplateParamsForm } from "@/features/integration-messenger/message-templates/components/template-params-form"
import { MessengerTemplatePreview } from "@/features/integration-messenger/message-templates/components/template-preview"
import type { FlowMessengerTemplateResource } from "@/features/integration-messenger/message-templates/schema/resource"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { BaseStepEditor } from "../base/editor"
import { ButtonStepEditor } from "../button/editor"

type SendMessengerTemplateMessageStepEditorProps = {
  parentName: string
}

function SendMessengerTemplateMessageStepEditor(
  props: SendMessengerTemplateMessageStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const { getValues, setValue, unregister, watch } = useFormContext()
  const [selectedTemplate, setSelectedTemplate] =
    useState<FlowMessengerTemplateResource | null>(null)
  const [parameters, setParameters] = useState<ParameterInfo[]>([])
  const prevInboxIdRef = useRef<string | undefined>(undefined)
  const prevTemplateIdRef = useRef<string | undefined>(undefined)

  const messengerInboxOptions = useMessengerInboxOptions()
  const messengerTemplates = useFlowTemplate((s) => s.messengerTemplates)

  const integrationInboxId = watch(`${parentName}.template.inboxId`)
  const templateId = watch(`${parentName}.template.id`)
  const templateParams = watch(`${parentName}.template.params`) || {}
  const parameterFormat =
    (watch(`${parentName}.template.parameterFormat`) as
      | "POSITIONAL"
      | "NAMED") || "POSITIONAL"
  const flowButtons = (watch(`${parentName}.buttons`) as unknown[]) || []
  const resetTemplateParams = useCallback(
    (
      template: FlowMessengerTemplateResource,
      format: "POSITIONAL" | "NAMED",
    ) => {
      unregister(`${parentName}.template.params`)
      setValue(
        `${parentName}.template.params`,
        extractMessengerTemplateParams(
          template.components as MessengerTemplateComponent[],
          format,
        ),
        { shouldDirty: true, shouldValidate: true },
      )
    },
    [parentName, setValue, unregister],
  )
  const resetFlowButtons = useCallback(
    (template: FlowMessengerTemplateResource) => {
      const templateButtons = extractMessengerFlowButtons(
        template.components as MessengerTemplateComponent[],
      )
      const existingButtons =
        (getValues(`${parentName}.buttons`) as ButtonStepProps[] | undefined) ??
        []

      setValue(
        `${parentName}.buttons`,
        mergeMessengerFlowButtonsWithExisting(templateButtons, existingButtons),
        { shouldDirty: true, shouldValidate: true },
      )
    },
    [getValues, parentName, setValue],
  )

  useEffect(() => {
    if (
      prevInboxIdRef.current !== undefined &&
      prevInboxIdRef.current !== integrationInboxId
    ) {
      setValue(`${parentName}.template.id`, "")
      setValue(`${parentName}.template.name`, "")
      setValue(`${parentName}.template.language`, "")
      setValue(`${parentName}.template.parameterFormat`, "POSITIONAL")
      unregister(`${parentName}.template.params`)
      setValue(`${parentName}.template.params`, {})
      setSelectedTemplate(null)
      setParameters([])
    }
    prevInboxIdRef.current = integrationInboxId
  }, [integrationInboxId, parentName, setValue, unregister])

  useEffect(() => {
    if (templateId && messengerTemplates.length > 0) {
      const template = messengerTemplates.find((t) => t.id === templateId)
      if (template) {
        const hasTemplateChanged =
          prevTemplateIdRef.current !== undefined &&
          prevTemplateIdRef.current !== templateId
        setSelectedTemplate(template)
        setValue(`${parentName}.template.name`, template.name)
        setValue(`${parentName}.template.language`, template.language)
        setValue(
          `${parentName}.template.parameterFormat`,
          template.parameterFormat,
        )
        const format = (template.parameterFormat ?? "POSITIONAL") as
          | "POSITIONAL"
          | "NAMED"
        if (hasTemplateChanged) {
          resetTemplateParams(template, format)
        }
        const params = extractMessengerParameterInfos(
          template.components as MessengerTemplateComponent[],
          format,
        )
        setParameters(params)

        if (hasTemplateChanged) {
          resetFlowButtons(template)
        } else {
          // Seed flow buttons only when not yet configured (preserve persisted buttons)
          const existingButtons = watch(`${parentName}.buttons`)
          if (!existingButtons || (existingButtons as unknown[]).length === 0) {
            resetFlowButtons(template)
          }
        }
      }
    }
    prevTemplateIdRef.current = templateId
  }, [
    templateId,
    messengerTemplates,
    parentName,
    resetFlowButtons,
    resetTemplateParams,
    setValue,
    watch,
  ])

  const filteredTemplates = useMemo(
    () =>
      (messengerTemplates ?? []).filter(
        (template) =>
          template.integrationMessenger?.inboxId === integrationInboxId,
      ),
    [messengerTemplates, integrationInboxId],
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

    const template = messengerTemplates?.find((t) => t.id === value)
    if (template) {
      const format = (template.parameterFormat ?? "POSITIONAL") as
        | "POSITIONAL"
        | "NAMED"
      setValue(`${parentName}.template.id`, template.id)
      setValue(`${parentName}.template.name`, template.name)
      setValue(`${parentName}.template.language`, template.language)
      setValue(`${parentName}.template.parameterFormat`, format)
      resetTemplateParams(template, format)
      resetFlowButtons(template)
      setSelectedTemplate(template)
      const params = extractMessengerParameterInfos(
        template.components as MessengerTemplateComponent[],
        format,
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
          options={messengerInboxOptions}
          placeholder={t("actions.pleaseSelect")}
          required={true}
        />

        <SelectField
          name={`${parentName}.template.id`}
          options={templateOptions}
          placeholder={t("flows.fields.selectMessengerTemplatePlaceholder")}
          triggerValueChange={handleTemplateChange}
        />

        {parameters.length > 0 && (
          <MessengerTemplateParamsForm
            components={
              selectedTemplate?.components as MessengerTemplateComponent[]
            }
            key={templateId}
            parameterFormat={parameterFormat}
            parentName={`${parentName}.template.params`}
          />
        )}

        {selectedTemplate && (
          <div className="mt-4">
            <div className="mb-2 font-medium text-xs">
              {t("flows.fields.preview")}
            </div>
            <MessengerTemplatePreview
              bodyParams={templateParams.body || []}
              buttonParams={templateParams.button || []}
              components={
                selectedTemplate.components as MessengerTemplateComponent[]
              }
              headerParams={templateParams.header || []}
            />
          </div>
        )}

        {flowButtons.length > 0 && (
          <div className="flex flex-col gap-2">
            {flowButtons.map((_btn, index) => (
              <ButtonStepEditor
                editorConfig={{
                  lockLabel: true,
                  hiddenButtonTypes: ["openWebsite"],
                  hideDelete: true,
                }}
                // biome-ignore lint/suspicious/noArrayIndexKey: stable seeded list
                key={index}
                parentName={`${parentName}.buttons.${index}`}
              />
            ))}
          </div>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default SendMessengerTemplateMessageStepEditor
