import { FileType, MessageType } from "@aha.chat/database/types"
import type {
  MessageButtonTemplate,
  MessageTemplateEntity,
} from "@aha.chat/sdk"
import { Button } from "@aha.chat/ui/components/ui/button"
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
    case MessageType.incoming:
      variant = guestDisplay ? "right" : "left"
      break
    case MessageType.outgoing:
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
            {RenderContentAttributes(props)}
          </div>
        )}
        {message.attachments &&
          message.attachments.length > 0 &&
          RenderAttachments({ message })}
      </div>
    </MessageBubble>
  )
}

const RenderAttachments = (props: { message: MessageResource }) => {
  const { message } = props

  return (
    <div>
      {(message.attachments ?? []).map((attachment) => {
        switch (attachment.fileType) {
          case FileType.image:
            return (
              <Image
                alt={attachment.name || "Attachment"}
                height={attachment.height || 0}
                key={attachment.id}
                src={attachment.url}
                width={attachment.width || 0}
              />
            )
          case FileType.video:
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
          case FileType.audio:
            return (
              <audio controls key={attachment.id} preload="none">
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </audio>
            )
          default:
            return (
              <div
                className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
                key={attachment.id}
              >
                <PaperclipIcon size={16} />
                <Link href={attachment.url ?? "/#"}>{attachment.name}</Link>
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
          {contentAttributes.payload.buttons.map((button) => {
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
        </div>
      )
    default:
      return null
  }
}
