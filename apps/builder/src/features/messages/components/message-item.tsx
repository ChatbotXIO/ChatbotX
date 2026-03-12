import type {
  MessageButtonTemplate,
  MessageTemplateEntity,
} from "@aha.chat/sdk"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@aha.chat/ui/components/ui/carousel"
import { cn } from "@aha.chat/ui/lib/utils"
import { format } from "date-fns"
import { ExternalLinkIcon, PaperclipIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { MessageResource } from "../schemas"
import { MessageBubble } from "./message-bubble"

type MessageItemProps = {
  message: MessageResource
  guestDisplay?: boolean
  onPostback?: (button: MessageButtonTemplate) => void
}

export const MessageItem = (props: MessageItemProps) => {
  const { message, guestDisplay = false } = props

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

  return (
    <MessageBubble
      title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
      variant={variant}
    >
      <div className="mx-3 flex min-h-11 max-w-[70%] flex-col gap-1">
        {message.content && message.content.length > 0 && (
          <div className={cn("text-sm", variants[variant])}>
            <pre className="break-word whitespace-pre-line font-sans">
              {message.content}
            </pre>
          </div>
        )}
        {message.attachments &&
          message.attachments.length > 0 &&
          RenderAttachments({ message })}
        {RenderContentAttributes(props)}
      </div>
    </MessageBubble>
  )
}

const RenderAttachments = (props: { message: MessageResource }) => {
  const { message } = props

  return (
    <div className="grid grid-cols-auto gap-2">
      {(message.attachments ?? []).map((attachment) => {
        switch (attachment.fileType) {
          case "image":
            return (
              <Image
                alt={attachment.name || "Attachment"}
                className="max-w-80 rounded-xl"
                height={attachment.height || 0}
                key={attachment.id}
                src={attachment.url}
                width={attachment.width || 0}
              />
            )
          case "video":
            return (
              <video
                controls
                height="240"
                key={attachment.id}
                preload="none"
                width="320"
              >
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </video>
            )
          case "audio":
            return (
              <audio controls key={attachment.id} preload="none">
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </audio>
            )
          default:
            return (
              <div
                className="flex items-center gap-2 overflow-hidden rounded-xl bg-secondary p-3 text-sm"
                key={attachment.id}
              >
                <PaperclipIcon className="size-5 flex-none" />
                <Link className="truncate" href={attachment.url}>
                  {attachment.url}
                </Link>
              </div>
            )
        }
      })}
    </div>
  )
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
                        <CardContent className="flex aspect-square flex-col items-center justify-center overflow-hidden p-0">
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
                              <span className="truncate text-muted-foreground text-sm">
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
