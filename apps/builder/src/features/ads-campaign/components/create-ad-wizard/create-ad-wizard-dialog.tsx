"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { buildCreateMessagingAdRequest } from "../../lib/build-create-request"
import { AdSetStep } from "./ad-set-step"
import { CampaignStep } from "./campaign-step"
import { CreativeStep } from "./creative-step"
import { PreflightStep } from "./preflight-step"
import {
  buildWizardFormSchema,
  STEP_FIELDS,
  WIZARD_STEP_COUNT,
  type WizardFormValues,
  type WizardMessagingAdChannel,
  wizardDefaultValues,
} from "./wizard-form-schema"

type Props = {
  workspaceId: string
  channel: WizardMessagingAdChannel
  integrationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

/**
 * oRPC surfaces a generic "Input validation failed" as `error.message`, but the
 * useful, specific reason lives in `error.data.issues[].message`. Prefer the
 * first issue's message so the user sees WHY (e.g. "Select at least one country
 * …") instead of the opaque outer message.
 */
function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const issues = (error as { data?: { issues?: { message?: string }[] } })
      .data?.issues
    const issueMessage = issues?.find((issue) => issue.message)?.message
    if (issueMessage) {
      return issueMessage
    }
  }
  return error instanceof Error ? error.message : fallback
}

const STEP_TITLE_KEYS = [
  "adsCampaign.wizard.campaignStep.title",
  "adsCampaign.wizard.adSetStep.title",
  "adsCampaign.wizard.creativeStep.title",
  "adsCampaign.wizard.preflightStep.title",
] as const

export function CreateAdWizardDialog({
  workspaceId,
  channel,
  integrationId,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const t = useTranslations()
  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const schema = useMemo(() => buildWizardFormSchema(channel), [channel])
  const form = useForm<WizardFormValues>({
    resolver: zodResolver(schema),
    defaultValues: wizardDefaultValues,
  })

  // Uploaded media (image_hash / video_id) is created UNDER the ad account
  // selected at upload time. If the user then switches ad account, that media
  // belongs to the old account and Meta rejects a creative that references it.
  // Clear the uploaded media when the ad account changes so the user re-uploads
  // under the new account.
  const adAccountId = form.watch("adAccountId")
  const prevAdAccountIdRef = useRef(adAccountId)
  useEffect(() => {
    if (
      prevAdAccountIdRef.current &&
      prevAdAccountIdRef.current !== adAccountId
    ) {
      form.setValue("mediaKind", "")
      form.setValue("imageHash", "")
      form.setValue("imagePreviewUrl", "")
      form.setValue("videoId", "")
      form.setValue("videoThumbnailHash", "")
      form.setValue("videoReady", false)
    }
    prevAdAccountIdRef.current = adAccountId
  }, [adAccountId, form])

  const resetAndClose = () => {
    form.reset(wizardDefaultValues)
    setStep(0)
    onOpenChange(false)
  }

  const goNext = async () => {
    const isValid = await form.trigger(STEP_FIELDS[step])
    if (!isValid) {
      return
    }
    setStep((current) => current + 1)
  }

  const goBack = () => setStep((current) => Math.max(0, current - 1))

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true)
    try {
      await client.adsCampaignAPI.createMessagingAd(
        buildCreateMessagingAdRequest(values, {
          workspaceId,
          channel,
          integrationId,
        }),
      )
      toast.success(t("adsCampaign.messages.created"))
      onCreated()
      resetAndClose()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t("messages.error")))
    } finally {
      setIsSubmitting(false)
    }
  })

  return (
    <Dialog
      onOpenChange={(next, eventDetails) => {
        if (next) {
          onOpenChange(true)
          return
        }
        // Only the ✕ button or Cancel may dismiss the wizard — ignore
        // click-outside and Escape so an in-progress ad draft isn't lost by a
        // stray click. (Cancel calls `resetAndClose` directly; the ✕ button
        // fires this with reason "close-press", which falls through below.)
        if (
          eventDetails.reason === "outside-press" ||
          eventDetails.reason === "escape-key"
        ) {
          return
        }
        resetAndClose()
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] w-[92vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(STEP_TITLE_KEYS[step] ?? STEP_TITLE_KEYS[0])}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (step === WIZARD_STEP_COUNT - 1) {
                onSubmit(event)
              }
            }}
          >
            {step === 0 && <CampaignStep />}
            {step === 1 && (
              <AdSetStep
                channel={channel}
                integrationId={integrationId}
                workspaceId={workspaceId}
              />
            )}
            {step === 2 && (
              <CreativeStep
                channel={channel}
                integrationId={integrationId}
                workspaceId={workspaceId}
              />
            )}
            {step === 3 && <PreflightStep channel={channel} />}

            <DialogFooter className="mt-4">
              {step > 0 && (
                <Button onClick={goBack} type="button" variant="ghost">
                  {t("actions.back")}
                </Button>
              )}
              <Button onClick={resetAndClose} type="button" variant="outline">
                {t("actions.cancel")}
              </Button>
              {step < WIZARD_STEP_COUNT - 1 ? (
                <Button onClick={goNext} type="button">
                  {t("actions.next")}
                </Button>
              ) : (
                <Button disabled={isSubmitting} type="submit">
                  {t("adsCampaign.wizard.createDraft")}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
