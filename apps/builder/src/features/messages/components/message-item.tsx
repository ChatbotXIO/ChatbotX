"use client"

import type {
  MessageButtonTemplate,
  MessageTemplateEntity,
} from "@chatbotx.io/sdk"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@chatbotx.io/ui/components/ui/carousel"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { format } from "date-fns"
import {
  ExternalLinkIcon,
  PaperclipIcon,
  ReplyIcon,
  ThumbsUp,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { useAttachmentUrl } from "@/features/attachments/utils"
import type { MessageResourceWithRelations } from "../schema/resource"
import { MessageActions, MessageActionsEditor } from "./message-actions"
import { MessageBubble } from "./message-bubble"

type MessageItemProps = {
  message: MessageResourceWithRelations
  guestDisplay?: boolean
  onChangeHide?: () => void
  onChangeLike?: () => void
  onDelete?: () => void
  onEdit?: (message: {
    id: string
    createdAt: Date
    text: string
    newAttachmentPath?: string
    newAttachmentPublicUrl?: string
    newAttachmentMimeType?: string
    newAttachmentName?: string
    newAttachmentSize?: number
    removeAttachment?: boolean
  }) => void
  onPostback?: (button: MessageButtonTemplate) => void
  onReply?: (comment: { commentId: string; text: string }) => void
}

export const MessageItem = (props: MessageItemProps) => {
  const {
    message,
    guestDisplay = false,
    onChangeLike,
    onChangeHide,
    onReply,
    onDelete,
    onEdit,
  } = props
  const t = useTranslations("messages")
  const [isEditing, setIsEditing] = useState(false)

  const variants: Record<"left" | "right" | "full", string> = {
    left: "px-4 py-3 rounded-xl bg-secondary",
    right: "px-4 py-3 rounded-xl bg-primary text-primary-foreground",
    full: "text-center w-full text-muted-foreground",
  }

  let variant: "left" | "right" | "full" = "full"
  switch (message.messageType) {
    case "incoming":
      variant = guestDisplay ? "right" : "left"
      break
    case "outgoing":
      variant = guestDisplay ? "left" : "right"
      break
    default:
      variant = "full"
      break
  }

  const isComment = message.type === "comment"
  const isDeleted = message.deletedAt != null
  const attributes = message.attributes as {
    liked?: boolean
    hidden?: boolean
  } | null
  const isLiked = attributes?.liked === true
  const isHidden = attributes?.hidden === true
  const hasAttachments = !!message.attachments?.length

  return (
    <MessageBubble
      className="group"
      title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
      variant={variant}
    >
      <div className="flex min-h-11 max-w-[70%] flex-col gap-1">
        {isComment ? (
          (message.text ||
            (message.attachments && message.attachments.length > 0)) && (
            <div
              className={cn(
                "relative text-sm",
                variants[variant],
                isDeleted && "opacity-50",
                isHidden && "opacity-50",
              )}
            >
              {!isEditing &&
                (isDeleted || (message.text && message.text.length > 0)) && (
                  <pre className="wrap-break-word whitespace-pre-line font-sans">
                    <CommentText
                      deletedLabel={t("messageDeleted")}
                      hiddenLabel={t("commentHidden")}
                      isDeleted={isDeleted}
                      isHidden={isHidden}
                      text={message.text}
                    />
                  </pre>
                )}
              {!(isEditing || isDeleted) && hasAttachments && (
                <RenderAttachments message={message} />
              )}
              {isEditing && onEdit && (
                <MessageActionsEditor
                  message={message}
                  onEdit={onEdit}
                  onEditingChange={setIsEditing}
                />
              )}
              {isLiked && (
                <span className="absolute -right-2 -bottom-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <ThumbsUp className="size-3" />
                </span>
              )}
            </div>
          )
        ) : (
          <>
            {(isDeleted || (message.text && message.text.length > 0)) && (
              <div
                className={cn(
                  "text-sm",
                  variants[variant],
                  isDeleted && "opacity-50",
                )}
              >
                <pre className="wrap-break-word whitespace-pre-line font-sans">
                  {isDeleted ? (
                    <span className="text-xs italic">
                      {t("messageDeleted")}
                    </span>
                  ) : (
                    message.text
                  )}
                </pre>
              </div>
            )}
            {!isDeleted && hasAttachments && (
              <RenderAttachments message={message} />
            )}
          </>
        )}
        {RenderContentAttributes(props)}
      </div>

      <div className="flex">
        {isComment && !isEditing && message.messageType === "incoming" && (
          <Button
            className="self-center opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onChangeLike}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ThumbsUp className={cn("size-4", isLiked && "fill-current")} />
          </Button>
        )}

        {isComment &&
          !isEditing &&
          onReply &&
          message.messageType === "incoming" &&
          message.sourceId && (
            <Button
              className="self-center opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() =>
                onReply({
                  commentId: message.sourceId as string,
                  text: message.text ?? "",
                })
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <ReplyIcon className="size-4" />
            </Button>
          )}

        {isComment && !isEditing && (
          <MessageActions
            message={message}
            onChangeHide={onChangeHide}
            onDelete={onDelete}
            onEdit={message.messageType === "outgoing" ? onEdit : undefined}
            onEditingChange={setIsEditing}
          />
        )}
      </div>
    </MessageBubble>
  )
}

const CommentText = (props: {
  deletedLabel: string
  hiddenLabel: string
  isDeleted: boolean
  isHidden: boolean
  text: string | null
}) => {
  const { deletedLabel, hiddenLabel, isDeleted, isHidden, text } = props
  if (isDeleted) {
    return <span className="text-xs italic">{deletedLabel}</span>
  }
  if (isHidden) {
    return <span className="text-xs italic">{hiddenLabel}</span>
  }
  return text
}

const RenderAttachments = (props: {
  message: MessageResourceWithRelations
}) => {
  const { message } = props

  return (
    <div className="grid grid-cols-auto gap-2">
      {(message.attachments ?? []).map((attachment) => (
        <RenderAttachmentItem attachment={attachment} key={attachment.id} />
      ))}
    </div>
  )
}

const RenderAttachmentItem = (props: { attachment: AttachmentResource }) => {
  const { attachment } = props
  const attachmentUrl = useAttachmentUrl(attachment)
  const attachmentLabel =
    attachment.name || attachment.originPath || "Attachment"

  if (!attachmentUrl) {
    return (
      <div className="flex items-center gap-2 overflow-hidden rounded-xl bg-secondary p-3 text-sm">
        <PaperclipIcon className="size-5 flex-none" />
        <span className="truncate">{attachmentLabel}</span>
      </div>
    )
  }

  switch (attachment.fileType) {
    case "image": {
      if (!(attachment.width && attachment.height)) {
        return (
          <div
            className="relative max-w-80 overflow-hidden rounded-xl"
            style={{ aspectRatio: "4/3" }}
          >
            <Image
              alt={attachmentLabel}
              className="object-contain"
              fill
              src={attachmentUrl}
            />
          </div>
        )
      }
      return (
        <Image
          alt={attachmentLabel}
          className="max-w-80 rounded-xl"
          height={attachment.height}
          src={attachmentUrl}
          width={attachment.width}
        />
      )
    }
    case "video":
      return (
        <video controls height="240" preload="none" width="320">
          <track default kind="captions" />
          <source src={attachmentUrl} type={attachment.mimeType} />
        </video>
      )
    case "audio":
      return (
        <audio controls preload="none">
          <track default kind="captions" />
          <source src={attachmentUrl} type={attachment.mimeType} />
        </audio>
      )
    default:
      return (
        <div className="flex items-center gap-2 overflow-hidden rounded-xl bg-secondary p-3 text-sm">
          <PaperclipIcon className="size-5 flex-none" />
          <Link className="truncate" href={attachmentUrl}>
            {attachmentUrl}
          </Link>
        </div>
      )
  }
}

const RenderContentAttributes = (props: MessageItemProps) => {
  const { message, onPostback } = props
  const contentAttributes = message.contentAttributes as
    | MessageTemplateEntity
    | undefined

  if (!contentAttributes) {
    return null
  }

  switch (contentAttributes.type) {
    case "template":
      return (
        <div className="mt-1 flex flex-col gap-1">
          {contentAttributes.payload.templateType === "button" &&
            contentAttributes.payload.buttons.map((button) => {
              if (button.buttonType === "url") {
                return (
                  <Button asChild key={button.id} size="sm" variant="secondary">
                    <Link href={button.url} target="_blank">
                      <ExternalLinkIcon />
                      {button.label}
                    </Link>
                  </Button>
                )
              }
              return (
                <Button
                  className="min-w-60 bg-secondary text-secondary-foreground disabled:bg-muted disabled:text-muted-foreground dark:bg-secondary dark:text-secondary-foreground dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                  disabled={!onPostback}
                  key={button.id}
                  onClick={() => {
                    onPostback?.(button)
                  }}
                  size="sm"
                  variant="outline"
                >
                  {button.label}
                </Button>
              )
            })}
          {contentAttributes.payload.templateType === "carousel" && (
            <Carousel
              opts={{
                align: "start",
              }}
            >
              <CarouselContent className="ml-0">
                {contentAttributes.payload.cards.map((card, _) => (
                  <CarouselItem className="w-32 pl-0" key={card.id}>
                    <div className="p-1">
                      <Card className="py-0">
                        <CardContent className="flex flex-col items-center justify-center overflow-hidden p-0">
                          <div className="flex w-full flex-1 flex-col gap-1">
                            {"imageUrl" in card && card.imageUrl && (
                              <Image
                                alt={card.title || "Attachment"}
                                className="max-h-64 w-full object-contain"
                                height={100}
                                src={card.imageUrl}
                                width={100}
                              />
                            )}
                            <span className="truncate px-2 font-semibold">
                              {card.title}
                            </span>
                            {"subtitle" in card && card.subtitle && (
                              <span className="truncate px-2 text-muted-foreground text-sm">
                                {card.subtitle}
                              </span>
                            )}
                          </div>
                          {"buttons" in card &&
                            card.buttons &&
                            card.buttons.map((button) => (
                              <Button
                                className="w-full"
                                key={button.id}
                                size="sm"
                                variant="secondary"
                              >
                                {button.label}
                              </Button>
                            ))}
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="-left-2" />
              <CarouselNext className="-right-2" />
            </Carousel>
          )}
        </div>
      )
    default:
      return null
  }
}
