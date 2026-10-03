"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useQueryClient } from "@tanstack/react-query"
import { InfoIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ClearableFlowSelector } from "@/features/sequences/components/flow-selector"
import { orpc } from "@/lib/orpc/query"
import { saveAiHandoverSettingsAction } from "../actions/save-ai-handover-settings.action"
import type { GetApplyToAllStatusResponse } from "../schema/bulk"
import {
  type SaveAiHandoverSettingsRequest,
  saveAiHandoverSettingsRequest,
} from "../schema/request"
import { AiHandoverApplyToAll } from "./ai-handover-apply-to-all"
import { AiHandoverTimeRangesField } from "./ai-handover-time-ranges-field"

type AiHandoverSettingsCardProps = {
  workspaceId: string
  /** The Messenger Page (inbox) these settings belong to. */
  inboxId: string
  initialValues: SaveAiHandoverSettingsRequest
  /** False for a non super admin or a platform support session: read-only. */
  canEdit: boolean
  initialApplyToAllStatus: GetApplyToAllStatusResponse
}

/**
 * A Page's Meta Business AI card (v1 layout): master switch, the "apply to all
 * customers" switch with its progress and history, run-time windows, what
 * happens when the AI hands a conversation back (a flow, else a message), and
 * whether to pause the bot for a human. The settings are saved explicitly; the
 * apply-to-all switch acts at once.
 */
export function AiHandoverSettingsCard({
  workspaceId,
  inboxId,
  initialValues,
  canEdit,
  initialApplyToAllStatus,
}: AiHandoverSettingsCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { form, handleSubmitWithAction, action } = useHookFormAction(
    saveAiHandoverSettingsAction.bind(null, workspaceId, inboxId),
    zodResolver(saveAiHandoverSettingsRequest),
    {
      formProps: { defaultValues: initialValues },
      actionProps: {
        onSuccess: ({ data }) => {
          // The saved row becomes the new baseline, so the form is clean again.
          form.reset(data)
          // Whether the automation runs now gates the apply-to-all switch, and
          // that is decided on the server.
          router.refresh()
          // The status carries whether the automation runs now.
          queryClient.invalidateQueries({
            queryKey: orpc.aiHandoverAPIs.getApplyToAllStatus.key(),
          })
          toast.success(t("messages.savedSuccessfully"))
        },
        onError: ({ error }) => {
          toast.error(error.serverError ?? t("messages.unknownError"))
        },
      },
    },
  )
  const isSaving = action.isExecuting

  return (
    <Card>
      <Form {...form}>
        <form className="flex flex-col gap-6" onSubmit={handleSubmitWithAction}>
          <CardHeader>
            <CardTitle>{t("aiHandover.title")}</CardTitle>
            <CardDescription>{t("aiHandover.description")}</CardDescription>
            <CardAction>
              <FormFieldWrapper name="enabled">
                {(field) => (
                  <Switch
                    aria-label={t("aiHandover.enabled.label")}
                    checked={field.value === true}
                    disabled={!canEdit || isSaving}
                    onCheckedChange={field.onChange}
                  />
                )}
              </FormFieldWrapper>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
              <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{t("aiHandover.info")}</span>
            </p>

            <AiHandoverApplyToAll
              canEdit={canEdit}
              inboxId={inboxId}
              initialStatus={initialApplyToAllStatus}
              workspaceId={workspaceId}
            />

            <fieldset
              className="flex flex-col gap-6"
              disabled={!canEdit || isSaving}
            >
              <AiHandoverTimeRangesField />

              <FormFieldWrapper
                description={t("aiHandover.gotoFlow.description")}
                label={t("aiHandover.gotoFlow.label")}
                name="gotoFlowId"
              >
                {(field) => (
                  <ClearableFlowSelector
                    clearLabel={t("aiHandover.gotoFlow.clear")}
                    onChange={field.onChange}
                    placeholder={t("aiHandover.gotoFlow.placeholder")}
                    value={typeof field.value === "string" ? field.value : null}
                  />
                )}
              </FormFieldWrapper>

              <TextareaField
                description={t("aiHandover.returnMessage.description")}
                label={t("aiHandover.returnMessage.label")}
                name="returnMessage"
                placeholder={t("aiHandover.returnMessage.placeholder")}
              />

              <SwitchField
                description={t("aiHandover.pauseBot.description")}
                label={t("aiHandover.pauseBot.label")}
                name="pauseBotWaitingForStaff"
                required
              />
            </fieldset>

            {canEdit ? (
              <div className="flex justify-end">
                <Button
                  disabled={isSaving || !form.formState.isDirty}
                  type="submit"
                >
                  {isSaving && (
                    <Loader2Icon aria-hidden className="size-4 animate-spin" />
                  )}
                  {t("actions.save")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("aiHandover.readOnly")}
              </p>
            )}
          </CardContent>
        </form>
      </Form>
    </Card>
  )
}
