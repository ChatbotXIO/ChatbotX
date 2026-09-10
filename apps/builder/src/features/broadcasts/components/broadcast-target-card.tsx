"use client"

import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import {
  extractMessengerFlowButtons,
  extractMessengerTemplateParams,
  extractTemplateParams,
  type MessengerTemplateComponent,
  type MessengerTemplateParams,
  type TemplateComponent,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { type ComponentType, type ReactNode, useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useFlowTemplate } from "@/features/flows/react-flow/stores/flow-template-store-provider"
import { MessengerTemplateParamsForm } from "@/features/integration-messenger/message-templates/components/template-params-form"
import { MessengerTemplatePreview } from "@/features/integration-messenger/message-templates/components/template-preview"
import type { ListMessengerMessageTemplatesResponse } from "@/features/integration-messenger/message-templates/schema/query"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"
import {
  buildTargetTemplateOptions,
  type TargetTemplateOption,
} from "../lib/broadcast-targets"
import { resolveTemplateHydration } from "../lib/template-hydration"
import type { BroadcastTargetRequest } from "../schema/action"
import { MessengerBroadcastFlowButtons } from "./messenger-broadcast-flow-buttons"

type TargetTemplateFieldsProps = {
  subaction: BroadcastSubaction
  /** Form path of this page's target, e.g. `targets.0`. */
  fieldName: string
  inboxId: string
  inboxName: string
  /** Template id the edited draft was hydrated with for this page. */
  hydratedTemplateId?: string
  /** The template is fixed by the broadcast-wide selection: no picker, params only. */
  templatePickerHidden?: boolean
  /** Shown above the fields (the page name, or the pages of a structure group). */
  title?: string
}

const APPROVED_TEMPLATE_STATUS = "APPROVED"

type TemplateSeed = Pick<BroadcastTargetRequest, "templateData" | "buttons">

/**
 * The page's template picker — the same control for every channel; only the
 * field label differs. Hidden when the template is fixed by a broadcast-wide
 * selection (`templatePickerHidden`).
 */
function TargetTemplatePicker(props: {
  hidden?: boolean
  label: string
  name: string
  options: TargetTemplateOption[]
}) {
  const t = useTranslations()
  if (props.hidden) {
    return null
  }
  return (
    <ComboboxField
      emptyText={t("actions.noRecordFound")}
      label={props.label}
      name={props.name}
      options={props.options}
      placeholder={t("actions.pleaseSelect")}
      required={true}
    />
  )
}

/** The labelled "Preview" section wrapping a channel's own preview component. */
function TargetTemplatePreviewSection({ children }: { children: ReactNode }) {
  const t = useTranslations()
  return (
    <div>
      <div className="mb-2 font-medium text-xs">
        {t("flows.fields.preview")}
      </div>
      {children}
    </div>
  )
}

/**
 * Shared selection logic of a page's template picker: only this page's
 * templates are offered, and picking one seeds its params (a reopened
 * draft keeps the params it was saved with — see `resolveTemplateHydration`).
 */
function useTargetTemplateSelection<
  TTemplate extends {
    id: string
    name: string
    language: string
    status: string
  },
>(
  props: TargetTemplateFieldsProps & {
    templates: readonly TTemplate[]
    templateInboxId: (template: TTemplate) => string
    seed: (template: TTemplate) => TemplateSeed
  },
) {
  const { fieldName, inboxId, inboxName, templates, templateInboxId } = props
  const { control, setValue } = useFormContext()
  const templateIdField = `${fieldName}.templateId`
  const watchedTemplateId = useWatch({ control, name: templateIdField }) as
    | string
    | undefined

  const options = useMemo(
    () =>
      buildTargetTemplateOptions(
        templates
          .filter((template) => template.status === APPROVED_TEMPLATE_STATUS)
          .map((template) => ({
            id: template.id,
            name: template.name,
            language: template.language,
            inboxId: templateInboxId(template),
          })),
        { inboxId, inboxName },
      ),
    [templates, templateInboxId, inboxId, inboxName],
  )

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template) =>
          template.id === watchedTemplateId &&
          templateInboxId(template) === inboxId,
      ) ?? null,
    [templates, templateInboxId, inboxId, watchedTemplateId],
  )

  const { subaction, hydratedTemplateId, seed } = props
  useEffect(() => {
    const decision = resolveTemplateHydration({
      subaction,
      watchedTemplateId,
      hydratedTemplateId,
    })
    if (decision === "skip" || templates.length === 0) {
      return
    }

    // Seeding writes params programmatically; under `mode: "onChange"` the
    // form's `isValid` only refreshes on a validated change, so the last write
    // validates — otherwise the submit buttons could stay disabled on a stale
    // validity (and a WhatsApp template's param rules would go unchecked).
    if (!selectedTemplate) {
      // A hydrated draft keeps its stored params even while its template is
      // missing from the list — the list may simply not have loaded yet.
      if (decision === "preserve") {
        return
      }
      setValue(`${fieldName}.templateData`, undefined)
      setValue(`${fieldName}.buttons`, [], { shouldValidate: true })
      return
    }

    if (decision === "seed") {
      const seeded = seed(selectedTemplate)
      setValue(`${fieldName}.templateData`, seeded.templateData)
      setValue(`${fieldName}.buttons`, seeded.buttons ?? [], {
        shouldValidate: true,
      })
    }
  }, [
    subaction,
    watchedTemplateId,
    hydratedTemplateId,
    templates.length,
    selectedTemplate,
    seed,
    fieldName,
    setValue,
  ])

  return { templateIdField, options, selectedTemplate }
}

const whatsappTemplateInboxId = (
  template: ListWhatsappMessageTemplatesResponse[number],
) => template.integrationWhatsapp.inboxId

const seedWhatsappTemplate = (
  template: ListWhatsappMessageTemplatesResponse[number],
): TemplateSeed => ({
  templateData: extractTemplateParams(
    template.components as TemplateComponent[],
  ),
})

function WhatsappTargetTemplateFields(props: TargetTemplateFieldsProps) {
  const t = useTranslations()
  const templates = useFlowTemplate((state) => state.whatsappTemplates)
  const { control } = useFormContext()
  const { templateIdField, options, selectedTemplate } =
    useTargetTemplateSelection({
      ...props,
      templates,
      templateInboxId: whatsappTemplateInboxId,
      seed: seedWhatsappTemplate,
    })
  const templateData = useWatch({
    control,
    name: `${props.fieldName}.templateData`,
  }) as WaTemplateParams | undefined

  return (
    <>
      <TargetTemplatePicker
        hidden={props.templatePickerHidden}
        label={t("fields.templateId.label")}
        name={templateIdField}
        options={options}
      />

      {selectedTemplate && (
        <div className="space-y-4">
          <TemplateParamsForm
            components={selectedTemplate.components as TemplateComponent[]}
            parentName={`${props.fieldName}.templateData`}
          />
          <TargetTemplatePreviewSection>
            <TemplatePreview
              bodyParams={templateData?.body || []}
              buttonParams={templateData?.button || []}
              components={selectedTemplate.components as TemplateComponent[]}
              headerParams={templateData?.header || []}
              limitedTimeOfferParam={templateData?.limited_time_offer}
            />
          </TargetTemplatePreviewSection>
        </div>
      )}
    </>
  )
}

const messengerTemplateInboxId = (
  template: ListMessengerMessageTemplatesResponse[number],
) => template.integrationMessenger.inboxId

const seedMessengerTemplate = (
  template: ListMessengerMessageTemplatesResponse[number],
): TemplateSeed => ({
  templateData: extractMessengerTemplateParams(
    template.components as MessengerTemplateComponent[],
    template.parameterFormat as "POSITIONAL" | "NAMED",
  ),
  buttons: extractMessengerFlowButtons(
    template.components as MessengerTemplateComponent[],
  ).map((button) => ({ id: button.id, label: button.label, flowId: "" })),
})

function MessengerTargetTemplateFields(props: TargetTemplateFieldsProps) {
  const t = useTranslations()
  const templates = useFlowTemplate((state) => state.messengerTemplates)
  const { control } = useFormContext()
  const { templateIdField, options, selectedTemplate } =
    useTargetTemplateSelection({
      ...props,
      templates,
      templateInboxId: messengerTemplateInboxId,
      seed: seedMessengerTemplate,
    })
  const templateData = useWatch({
    control,
    name: `${props.fieldName}.templateData`,
  }) as MessengerTemplateParams | undefined

  return (
    <>
      <TargetTemplatePicker
        hidden={props.templatePickerHidden}
        label={t("fields.messengerTemplateId.label")}
        name={templateIdField}
        options={options}
      />

      {selectedTemplate && (
        <div className="space-y-4">
          <MessengerTemplateParamsForm
            components={
              selectedTemplate.components as MessengerTemplateComponent[]
            }
            parameterFormat={
              selectedTemplate.parameterFormat as "POSITIONAL" | "NAMED"
            }
            parentName={`${props.fieldName}.templateData`}
          />
          <TargetTemplatePreviewSection>
            <MessengerTemplatePreview
              bodyParams={templateData?.body || []}
              buttonParams={templateData?.button || []}
              components={
                selectedTemplate.components as MessengerTemplateComponent[]
              }
              headerParams={templateData?.header || []}
            />
          </TargetTemplatePreviewSection>
          <MessengerBroadcastFlowButtons name={`${props.fieldName}.buttons`} />
        </div>
      )}
    </>
  )
}

// One template picker per template-capable channel. Adding a channel means
// adding one entry here; the card itself stays channel-agnostic.
const targetTemplateFieldsByChannel: Partial<
  Record<ChannelType, ComponentType<TargetTemplateFieldsProps>>
> = {
  whatsapp: WhatsappTargetTemplateFields,
  messenger: MessengerTargetTemplateFields,
}

type BroadcastTargetCardProps = TargetTemplateFieldsProps & {
  channel: ChannelType
}

/** One page of a multi-page template broadcast: its template, params and preview. */
export function BroadcastTargetCard({
  channel,
  ...fieldsProps
}: BroadcastTargetCardProps) {
  const TemplateFields = targetTemplateFieldsByChannel[channel]
  if (!TemplateFields) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {fieldsProps.title ?? fieldsProps.inboxName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TemplateFields {...fieldsProps} />
      </CardContent>
    </Card>
  )
}
