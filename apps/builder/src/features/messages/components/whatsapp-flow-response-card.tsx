"use client"

import type { MessageWhatsappFlowResponseEntity } from "@chatbotx.io/sdk"
import {
  ImageIcon,
  ListChecksIcon,
  PaperclipIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { useAttachmentSource } from "@/features/attachments/utils"
import { WhatsappFlowResponseButton } from "./whatsapp-flow-response-dialog"
import { hasThumbnail } from "./whatsapp-flow-response-file"

/** Photos previewed on the card; the rest are a "+N", the dialog lists all. */
const MAX_PREVIEW_PHOTOS = 4
const THUMBNAIL_SIZE_PX = 40

type FlowResponseCardMessage = {
  id: string
  workspaceId: string
  conversationId: string
  createdAt: Date | string
  text: string | null
  attachments?: AttachmentResource[] | null
}

const countNotSavedFiles = (entity: MessageWhatsappFlowResponseEntity) =>
  Object.values(entity.files ?? {}).reduce(
    (count, files) =>
      count + files.filter((file) => file.status === "failed").length,
    0,
  )

/**
 * A glance at a photo; opening it is the dialog's job. A photo too big or of a
 * type browsers cannot draw (HEIC, TIFF) shows an icon instead of loading.
 */
function FlowResponseThumbnail({
  attachment,
}: {
  attachment: AttachmentResource
}) {
  const { url, onError } = useAttachmentSource(attachment)
  const canPreview = Boolean(url) && hasThumbnail(attachment)

  return (
    <li className="size-10 shrink-0 overflow-hidden rounded-md bg-background/60 ring-1 ring-border">
      {canPreview && url ? (
        <Image
          alt=""
          className="size-full object-cover"
          height={THUMBNAIL_SIZE_PX}
          onError={onError}
          src={url}
          unoptimized
          width={THUMBNAIL_SIZE_PX}
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
        </span>
      )}
    </li>
  )
}

/**
 * A WhatsApp Flow response as one compact card: what the customer sent, a
 * glance at the files they attached, and the way to the answers. The full
 * list of files (links, sizes, why one was not kept) is in the dialog.
 */
export function WhatsappFlowResponseCard({
  message,
  entity,
}: {
  message: FlowResponseCardMessage
  entity: MessageWhatsappFlowResponseEntity
}) {
  const t = useTranslations("messages.flowResponse")
  const attachments = message.attachments ?? []
  const photos = attachments.filter(
    (attachment) => attachment.fileType === "image",
  )
  const previewPhotos = photos.slice(0, MAX_PREVIEW_PHOTOS)
  const hiddenPhotos = photos.length - previewPhotos.length
  const notSaved = countNotSavedFiles(entity)

  return (
    <article
      className="flex w-72 max-w-full flex-col overflow-hidden rounded-xl border bg-secondary"
      data-slot="whatsapp-flow-response-card"
    >
      <div className="flex flex-col gap-2 p-3">
        <header className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <ListChecksIcon aria-hidden className="size-3.5" />
          <span className="font-medium">{t("title")}</span>
        </header>
        {message.text && (
          <p className="wrap-break-word whitespace-pre-line text-sm">
            {message.text}
          </p>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {previewPhotos.length > 0 && (
              <ul aria-hidden className="flex flex-wrap items-center gap-1">
                {previewPhotos.map((attachment) => (
                  <FlowResponseThumbnail
                    attachment={attachment}
                    key={attachment.id}
                  />
                ))}
                {hiddenPhotos > 0 && (
                  <li className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background/60 font-medium text-muted-foreground text-xs tabular-nums">
                    +{hiddenPhotos}
                  </li>
                )}
              </ul>
            )}
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
              <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                {t("filesAttached", { count: attachments.length })}
              </span>
            </span>
          </div>
        )}
        {notSaved > 0 && (
          <p className="flex items-center gap-1.5 text-destructive text-xs">
            <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {t("filesNotSaved", { count: notSaved })}
          </p>
        )}
      </div>
      <WhatsappFlowResponseButton
        className="mt-0 h-10 w-full rounded-none border-0 border-t bg-transparent hover:bg-background/60"
        conversationId={message.conversationId}
        createdAt={message.createdAt}
        messageId={message.id}
        workspaceId={message.workspaceId}
      />
    </article>
  )
}
