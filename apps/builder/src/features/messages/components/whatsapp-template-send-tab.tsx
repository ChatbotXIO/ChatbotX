"use client"

import {
  extractTemplateParams,
  type TemplateComponent,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DialogClose } from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { TemplateParamsForm } from "@/features/integration-whatsapp/message-templates/components/template-params-form"
import { orpc } from "@/lib/orpc/query"
import { sendWhatsappTemplateAction } from "../actions/send-whatsapp-template.action"
import { sendWhatsappTemplateRequest } from "../schema/send-template"

/** APPROVED templates are the only ones WhatsApp will actually deliver. */
const APPROVED_TEMPLATE_STATUS = "APPROVED"

/**
 * Approved WhatsApp templates for a conversation's inbox, plus the integration
 * they belong to. Shared so the Send Flow dialog can both offer the templates
 * (this tab) and scope its Flow/Node tabs to the same number's integration —
 * derived from the templates rather than a separate resolver call.
 */
export function useWhatsappTemplatesForInbox(
  workspaceId: string,
  inboxId: string | undefined,
  enabled: boolean,
) {
  const { data: templates = [] } = useQuery(
    orpc.whatsappMessageTemplateAPIs.listWhatsappMessageTemplatesInternalAPI.queryOptions(
      {
        input: { workspaceId, inboxId, status: APPROVED_TEMPLATE_STATUS },
        enabled: Boolean(workspaceId && inboxId) && enabled,
      },
    ),
  )

  return {
    templates,
    integrationWhatsappId: templates[0]?.integrationWhatsappId as
      | string
      | undefined,
  }
}

type WhatsappTemplateSendTabProps = {
  workspaceId: string
  conversationId: string
  /**
   * The conversation's WhatsApp inbox — its integration's approved templates
   * are offered, and it resolves the send number server-side. Filtering by
   * inbox (not a resolved integration id) keeps the picker self-sufficient.
   */
  inboxId: string | undefined
  onDone: () => void
}

/**
 * "Send template" tab of the composer's Send Flow dialog: lists the
 * conversation number's approved WhatsApp templates, lets the agent fill the
 * template's params, and sends it straight into the open conversation (a
 * template send any responder may make, even on standby / a closed 24h window).
 * Self-contained form so it never mixes with the flow/node picker's form.
 */
export function WhatsappTemplateSendTab({
  workspaceId,
  conversationId,
  inboxId,
  onDone,
}: WhatsappTemplateSendTabProps) {
  const t = useTranslations()

  const { templates } = useWhatsappTemplatesForInbox(workspaceId, inboxId, true)

  const options = useMemo(
    () =>
      templates.map((template) => ({
        label: `${template.name} (${template.language})`,
        value: template.id,
      })),
    [templates],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    sendWhatsappTemplateAction.bind(null, workspaceId, conversationId),
    zodResolver(sendWhatsappTemplateRequest),
    {
      formProps: { defaultValues: { templateId: "", inboxId } },
      actionProps: {
        onSuccess: () => {
          toast.success(t("conversationRouting.template.sent"))
          onDone()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      errorMapProps: {},
    },
  )

  const { control, setValue } = form
  const templateId = useWatch({ control, name: "templateId" })

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  )

  // Seed the params form with the picked template's empty param skeleton, so
  // TemplateParamsForm renders one input per placeholder.
  useEffect(() => {
    if (!selectedTemplate) {
      setValue("templateData", undefined)
      return
    }
    setValue(
      "templateData",
      extractTemplateParams(
        selectedTemplate.components as TemplateComponent[],
      ) as WaTemplateParams,
      { shouldValidate: true },
    )
  }, [selectedTemplate, setValue])

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={handleSubmitWithAction}>
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          name="templateId"
          options={options}
          placeholder={t("fields.templateId.placeholder")}
          portal={true}
          required
        />

        {selectedTemplate && (
          <TemplateParamsForm
            components={selectedTemplate.components as TemplateComponent[]}
            parentName="templateData"
          />
        )}

        <div className="flex justify-end gap-2">
          <DialogClose
            render={<Button variant="outline">{t("actions.cancel")}</Button>}
          />
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2 className="animate-spin" />
            )}
            {t("actions.send")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
