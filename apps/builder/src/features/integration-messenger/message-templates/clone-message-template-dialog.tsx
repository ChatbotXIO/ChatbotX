"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CheckCircle2Icon, Loader2, XCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { cloneMessengerMessageTemplateAction } from "./actions/clone-message-templates"
import type { MessengerMessageTemplateResource } from "./schema/resource"

type Channel = {
  id: string
  name: string
}

type CloneResult = {
  succeeded: { channel: string }[]
  failed: { channel: string; error: string }[]
}

type CloneMessageTemplateDialogProps = {
  cloneTarget: MessengerMessageTemplateResource | null
  channels: Channel[]
  workspaceId: string
  sourceIntegrationMessengerId: string
  onClose: () => void
}

type CloneMessageTemplateFormProps = {
  cloneTarget: MessengerMessageTemplateResource
  channels: Channel[]
  workspaceId: string
  sourceIntegrationMessengerId: string
  onResult: (result: CloneResult) => void
}

const cloneSchema = z.object({
  targetIntegrationMessengerIds: z.array(zodBigintAsString()).min(1),
})

function CloneMessageTemplateForm({
  cloneTarget,
  channels,
  workspaceId,
  sourceIntegrationMessengerId,
  onResult,
}: CloneMessageTemplateFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const boundAction = useMemo(
    () =>
      cloneMessengerMessageTemplateAction.bind(
        null,
        workspaceId,
        sourceIntegrationMessengerId,
        cloneTarget.id,
      ),
    [workspaceId, sourceIntegrationMessengerId, cloneTarget.id],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(boundAction, zodResolver(cloneSchema), {
      actionProps: {
        onSuccess: ({ data }) => {
          if (!data) {
            return
          }
          // Show per-channel results in a dialog instead of a toast.
          onResult(data)
          resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          targetIntegrationMessengerIds: [],
        },
      },
      errorMapProps: {},
    })

  const channelOptions = useMemo(
    () =>
      channels
        .filter((c) => c.id !== sourceIntegrationMessengerId)
        .map((c) => ({ label: c.name, value: c.id })),
    [channels, sourceIntegrationMessengerId],
  )

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmitWithAction}>
        <MultiSelectField
          name="targetIntegrationMessengerIds"
          options={channelOptions}
          placeholder={t("messenger.messageTemplate.clone.channelsPlaceholder")}
        />

        <div className="flex justify-end gap-2">
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {t("actions.cancel")}
              </Button>
            }
          />

          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2 className="animate-spin" />
            )}
            {t("actions.clone")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function CloneResultDialog({
  result,
  onClose,
}: {
  result: CloneResult | null
  onClose: () => void
}) {
  const t = useTranslations()

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
      open={result !== null}
    >
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="mb-2">
          <DialogTitle>
            {t("messenger.messageTemplate.clone.result.title")}
          </DialogTitle>
        </DialogHeader>

        {result !== null && (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-48" />
              <col />
            </colgroup>
            <tbody>
              {result.succeeded.map((item) => (
                <tr
                  className="border-b border-dashed last:border-b-0"
                  key={`ok-${item.channel}`}
                >
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap py-3 pe-3 font-medium">
                    {item.channel}
                  </td>
                  <td className="py-3 ps-3 text-start">
                    <div className="flex w-full items-center gap-1.5 text-green-600">
                      <CheckCircle2Icon className="size-4 shrink-0" />
                      <span className="truncate">
                        {t(
                          "messenger.messageTemplate.clone.result.succeededTitle",
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {result.failed.map((item) => (
                <tr
                  className="border-b border-dashed last:border-b-0"
                  key={`fail-${item.channel}`}
                >
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap py-3 pe-3 font-medium">
                    {item.channel}
                  </td>
                  <td className="py-3 ps-3 text-start">
                    <div className="flex w-full items-center gap-1.5 text-destructive">
                      <XCircleIcon className="size-4 shrink-0" />
                      <div className="wrap-break-word min-w-0 flex-1 whitespace-pre-wrap text-destructive text-xs leading-relaxed">
                        {item.error}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <DialogFooter>
          <Button onClick={onClose} type="button">
            {t("messenger.messageTemplate.clone.result.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CloneMessageTemplateDialog({
  cloneTarget,
  channels,
  workspaceId,
  sourceIntegrationMessengerId,
  onClose,
}: CloneMessageTemplateDialogProps) {
  const t = useTranslations()
  const [result, setResult] = useState<CloneResult | null>(null)

  const closeResult = () => {
    setResult(null)
    onClose()
  }

  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          // Only treat as a cancel when there is no result transition in flight.
          if (!open && result === null) {
            onClose()
          }
        }}
        open={cloneTarget !== null && result === null}
      >
        <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="mb-2 space-y-2">
            <DialogTitle>
              {t("messenger.messageTemplate.clone.title")}
            </DialogTitle>
            {cloneTarget !== null && (
              <div className="flex w-full justify-center">
                <div className="inline-flex max-w-full items-center rounded-md border border-info/20 bg-info/10 px-3 py-1.5 text-center font-semibold text-info text-sm shadow-sm">
                  <span className="truncate">{cloneTarget.name}</span>
                </div>
              </div>
            )}
          </DialogHeader>

          {cloneTarget !== null && result === null && (
            <CloneMessageTemplateForm
              channels={channels}
              cloneTarget={cloneTarget}
              onResult={setResult}
              sourceIntegrationMessengerId={sourceIntegrationMessengerId}
              workspaceId={workspaceId}
            />
          )}
        </DialogContent>
      </Dialog>

      <CloneResultDialog onClose={closeResult} result={result} />
    </>
  )
}
