"use client"

import { isProfileLinkChannel } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { CopyIcon, ImageIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useInboxLinks } from "@/features/inboxes/provider/use-inbox-links"
import { toAuthorizedDomain } from "@/features/integration-webchat/lib/authorized-domain"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useTenantSettings } from "@/features/tenant"
import { useClipboard } from "@/hooks/use-clipboard"
import { updateReflinkWidgetAction } from "../actions/update-reflink-widget.action"
import { resolveWidgetBrand } from "../lib/widget-brand"
import {
  MAX_WIDGET_AUTHORIZED_DOMAINS,
  type UpdateReflinkWidgetRequest,
  updateReflinkWidgetRequest,
  type WidgetBrandIssueReason,
  widgetBrandIssueReasons,
} from "../schema/action"
import type { ListReflinkItem } from "../schema/query"
import {
  getWidgetIconUrl,
  ReflinkChatWidgetPreview,
} from "./reflink-chat-widget-preview"

type ReflinkChatWidgetDialogProps = {
  workspaceId: string
  reflink: ListReflinkItem | null
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

const WIDGET_BRAND_ISSUE_KEYS = {
  brandUrlRequiredWithName: "reflinks.chatWidget.brandUrl.requiredWithName",
  brandNameRequiredWithUrl: "reflinks.chatWidget.brandName.requiredWithUrl",
} as const satisfies Record<WidgetBrandIssueReason, string>

/** The reason the schema tags a brand name/URL pairing issue with, if any. */
function widgetBrandIssueReason(issue: {
  code?: string
  params?: Record<string, unknown>
}): WidgetBrandIssueReason | null {
  const reason = issue.code === "custom" ? issue.params?.reason : undefined
  return widgetBrandIssueReasons.find((known) => known === reason) ?? null
}

function pairedBrandField(name: string | undefined) {
  if (name === "brandName") {
    return "brandUrl"
  }
  if (name === "brandUrl") {
    return "brandName"
  }
  return null
}

function ReflinkChatWidgetForm({
  workspaceId,
  reflink,
  onClose,
}: {
  workspaceId: string
  reflink: ListReflinkItem
  onClose: () => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const { handleCopy } = useClipboard()
  const tenant = useTenantSettings()
  const inboxLinks = useInboxLinks({
    enabled: true,
    refConfig: { type: "reflink", name: reflink.name },
    includeProfileLinks: true,
  })

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateReflinkWidgetAction.bind(null, workspaceId, reflink.id),
    zodResolver(updateReflinkWidgetRequest, {
      error: (issue) => {
        const reason = widgetBrandIssueReason(issue)
        return reason ? t(WIDGET_BRAND_ISSUE_KEYS[reason]) : undefined
      },
    }),
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
          logoFileId: reflink.widgetLogoFileId ?? "",
          brandName: reflink.widgetBrandName ?? "",
          brandUrl: reflink.widgetBrandUrl ?? "",
        } satisfies UpdateReflinkWidgetRequest,
      },
    },
  )

  const hiddenInboxIds = form.watch("hiddenInboxIds")
  // The form holds the file id; the preview needs its storage path.
  const [logoPath, setLogoPath] = useState(reflink.widgetLogoFile?.path ?? null)
  const logoFileId = form.watch("logoFileId")
  const brandName = form.watch("brandName")
  const brandUrl = form.watch("brandUrl")
  const brand = resolveWidgetBrand(
    {
      widgetLogoPath: logoFileId ? logoPath : null,
      widgetBrandName: brandName.trim(),
      widgetBrandUrl: brandUrl,
    },
    tenant,
  )
  const hasBrandName = brandName.trim().length > 0
  const hasBrandUrl = brandUrl.length > 0

  // Brand name and URL are required together, so editing one re-checks the
  // other — RHF otherwise only validates the field being edited.
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      const pairedField = pairedBrandField(name)
      if (pairedField && form.getFieldState(pairedField).isDirty) {
        form.trigger(pairedField)
      }
    })
    return () => subscription.unsubscribe()
  }, [form])
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
  const embedCode = buildReflinkWidgetEmbedCode(tenant.appUrl, reflink.id)

  const setLogo = (file: { id: string; path: string }) => {
    setLogoPath(file.path)
    form.setValue("logoFileId", file.id, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

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
            <FormFieldWrapper<UpdateReflinkWidgetRequest>
              description={t("reflinks.chatWidget.logo.description")}
              label={t("fields.logo.label")}
              name="logoFileId"
            >
              {() => (
                <div className="flex items-center gap-4">
                  {/* biome-ignore lint/performance/noImgElement: storage or tenant icon URL, same image the embed script shows */}
                  <img
                    alt={t("fields.logo.label")}
                    className="size-14 rounded-full border object-cover"
                    height={56}
                    src={brand.logoUrl ?? getWidgetIconUrl("chat")}
                    width={56}
                  />
                  <MediaLibraryTrigger
                    onSelect={(file) => {
                      if (!file.mimeType.startsWith("image/")) {
                        toast.error(t("reflinks.chatWidget.logo.notImage"))
                        return
                      }
                      setLogo(file)
                    }}
                    workspaceId={workspaceId}
                  >
                    <Button type="button" variant="outline">
                      <ImageIcon className="size-4" />
                      {t("reflinks.chatWidget.logo.choose")}
                    </Button>
                  </MediaLibraryTrigger>
                </div>
              )}
            </FormFieldWrapper>

            <InputField<UpdateReflinkWidgetRequest>
              description={t("reflinks.chatWidget.brandName.description")}
              label={t("fields.brandName.label")}
              name="brandName"
              placeholder={t("fields.brandName.placeholder")}
              required={hasBrandUrl}
            />

            <InputField<UpdateReflinkWidgetRequest>
              description={t("reflinks.chatWidget.brandUrl.description")}
              label={t("reflinks.chatWidget.brandUrl.label")}
              name="brandUrl"
              placeholder={t("reflinks.chatWidget.brandUrl.placeholder")}
              required={hasBrandName}
              type="url"
            />

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
              <ReflinkChatWidgetPreview
                brand={brand}
                channels={visibleChannels}
              />
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
