"use client"

import { isProfileLinkChannel } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useInboxLinks } from "@/features/inboxes/provider/use-inbox-links"
import { toAuthorizedDomain } from "@/features/integration-webchat/lib/authorized-domain"
import { useTenantSettings } from "@/features/tenant"
import { useClipboard } from "@/hooks/use-clipboard"
import { updateReflinkWidgetAction } from "../actions/update-reflink-widget.action"
import {
  MAX_WIDGET_AUTHORIZED_DOMAINS,
  type UpdateReflinkWidgetRequest,
  updateReflinkWidgetRequest,
} from "../schema/action"
import type { ReflinkResource } from "../schema/resource"
import { ReflinkChatWidgetPreview } from "./reflink-chat-widget-preview"

type ReflinkChatWidgetDialogProps = {
  workspaceId: string
  reflink: ReflinkResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReflinkChatWidgetDialog({
  workspaceId,
  reflink,
  open,
  onOpenChange,
}: ReflinkChatWidgetDialogProps) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* Each enabled channel adds a 56px button to the preview, so many
          channels outgrow the viewport — scroll instead of clipping. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("reflinks.chatWidget.title")}</DialogTitle>
          <DialogDescription>
            {t("reflinks.chatWidget.description")}
          </DialogDescription>
        </DialogHeader>

        {reflink ? (
          <ReflinkChatWidgetForm
            key={reflink.id}
            onClose={() => onOpenChange(false)}
            reflink={reflink}
            workspaceId={workspaceId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function buildReflinkWidgetEmbedCode(appUrl: string, reflinkId: string) {
  return `<script async src="${appUrl}/chat-widget/ref-widget.js" data-reflink-id="${reflinkId}"></script>`
}

/**
 * The tags `z.hostname()` rejected. RHF keys a per-item error by its index,
 * so the array-shaped error lines up with the tag list.
 */
function findInvalidDomains(domains: string[], domainErrors: unknown) {
  if (!Array.isArray(domainErrors)) {
    return []
  }
  return domains.filter((_, index) => domainErrors[index])
}

function ReflinkChatWidgetForm({
  workspaceId,
  reflink,
  onClose,
}: {
  workspaceId: string
  reflink: ReflinkResource
  onClose: () => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const { handleCopy } = useClipboard()
  const { appUrl } = useTenantSettings()
  const inboxLinks = useInboxLinks({
    enabled: true,
    refConfig: { type: "reflink", name: reflink.name },
    includeProfileLinks: true,
  })

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateReflinkWidgetAction.bind(null, workspaceId, reflink.id),
    zodResolver(updateReflinkWidgetRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("reflinks.chatWidget.savedSuccess"))
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
          authorizedDomains: reflink.widgetAuthorizedDomains,
          hiddenInboxIds: reflink.widgetHiddenInboxIds,
        } satisfies UpdateReflinkWidgetRequest,
      },
    },
  )

  const hiddenInboxIds = form.watch("hiddenInboxIds")
  const invalidDomains = findInvalidDomains(
    form.watch("authorizedDomains"),
    form.formState.errors.authorizedDomains,
  )
  const visibleChannels = inboxLinks
    .filter(({ inbox }) => !hiddenInboxIds.includes(inbox.id))
    .map(({ inbox }) => ({
      id: inbox.id,
      channel: inbox.channel as ChannelType,
      name: inbox.name,
    }))
  const embedCode = buildReflinkWidgetEmbedCode(appUrl, reflink.id)

  const toggleInbox = (inboxId: string, visible: boolean) => {
    const others = hiddenInboxIds.filter((id) => id !== inboxId)
    form.setValue("hiddenInboxIds", visible ? others : [...others, inboxId], {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <TagsInputField<UpdateReflinkWidgetRequest>
              description={t(
                "reflinks.chatWidget.authorizedDomains.description",
              )}
              label={t("reflinks.chatWidget.authorizedDomains.label")}
              maxTags={MAX_WIDGET_AUTHORIZED_DOMAINS}
              name="authorizedDomains"
              placeholder={t(
                "reflinks.chatWidget.authorizedDomains.placeholder",
              )}
              transformTag={toAuthorizedDomain}
            />
            {invalidDomains.length > 0 ? (
              <p className="-mt-4 text-destructive text-sm">
                {t("reflinks.chatWidget.authorizedDomains.invalid", {
                  domains: invalidDomains.join(", "),
                })}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>{t("reflinks.chatWidget.channels.label")}</Label>
              <p className="text-muted-foreground text-sm">
                {t("reflinks.chatWidget.channels.description")}
              </p>
              <div className="flex max-h-[40vh] flex-col overflow-y-auto rounded-lg border px-4">
                {inboxLinks.length === 0 ? (
                  <p className="py-4 text-muted-foreground text-sm">
                    {t("reflinks.chatWidget.channels.empty")}
                  </p>
                ) : null}
                {inboxLinks.map(({ inbox }) => (
                  <div
                    className="flex items-center gap-3 border-t py-3 first:border-t-0"
                    key={inbox.id}
                  >
                    <div className="min-w-0 flex-1">
                      <InboxIcon
                        channel={inbox.channel as ChannelType}
                        iconClassName="size-6"
                        label={inbox.name}
                        size="large"
                      />
                      {isProfileLinkChannel(inbox.channel as ChannelType) ? (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {t("reflinks.chatWidget.channels.profileLinkOnly")}
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      aria-label={inbox.name}
                      checked={!hiddenInboxIds.includes(inbox.id)}
                      onCheckedChange={(checked) =>
                        toggleInbox(inbox.id, checked)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <Label>{t("reflinks.chatWidget.preview")}</Label>
              <ReflinkChatWidgetPreview channels={visibleChannels} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="reflink-widget-embed-code">
                  {t("fields.embedCode.label")}
                </Label>
                <Button
                  aria-label={t("actions.copy")}
                  onClick={() => handleCopy(embedCode)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
              <Textarea
                className="resize-none break-all font-mono text-sm"
                id="reflink-widget-embed-code"
                readOnly
                rows={4}
                value={embedCode}
              />
              <p className="text-muted-foreground text-sm">
                {t("reflinks.chatWidget.embedCodeDescription")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Button onClick={onClose} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
