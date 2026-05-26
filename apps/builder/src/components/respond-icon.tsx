import { cn } from "@chatbotx.io/ui/lib/utils"
import type { HTMLAttributes } from "react"

// Nomes de ícones disponíveis (mapeados em /src/app/respond-icons.css). Se
// precisar de outro, adicione no CSS + aqui. Lista completa de 848 está em
// _Projetos/respond-io-avatars/preview.html → consultar pra novos.
// 2026-05-24 — Pedro pediu "ícones idênticos ao Respond.io".
export type RespondIconName =
  | "tick-circle"
  | "tick-square"
  | "tick-square-bold"
  | "tick"
  | "send"
  | "search-normal"
  | "more"
  | "message-text"
  | "message-question"
  | "message-2"
  | "emoji-happy"
  | "close-circle"
  | "attach-square"
  | "arrow-down"
  | "arrow-down-1"
  | "arrow-up"
  | "arrow-up-1"
  | "arrow-left"
  | "arrow-right"
  | "ai-assist"
  | "ai-agent"
  | "add"
  | "workflow"
  | "user"
  | "user-add"
  | "flash"
  | "sticker"
  | "document"
  | "star"
  | "star-bold"
  | "volume-high"
  | "eye"
  | "eye-bold"
  | "edit"
  | "edit-bold"
  | "trash"
  | "trash-bold"
  | "forbidden"
  | "forbidden-bold"
  | "reply"
  | "copy"
  | "link-1"
  | "message-delivered"
  | "magicpen-bold"
  | "emoji-normal"
  | "i-microphone"
  | "receipt"
  | "message-programming"
  | "send-bold"
  | "comments-ai"
  | "ai-assist-bold"
  | "channels"
  | "at"
  | "close-square"
  | "custom-user-square-bold"
  | "translate"
  | "code"
  | "clock"
  | "clock-bold"
  | "sms"
  | "sms-bold"
  | "phone"
  | "call-calling"
  | "home"
  | "global"
  | "profile"
  | "profile-2user"
  | "note"
  | "notification"
  | "notification-bing"
  | "tag"
  | "tag-bold"
  | "filter"
  | "filter-bold"
  | "sort"
  | "verify-bold"
  | "received"
  | "whatsapp-bold"
  | "instagram"
  | "facebook"
  | "email"
  | "menu"
  | "sidebar-left"
  | "sidebar-right"
  | "refresh"
  | "refresh-circle"
  | "archive"
  | "minus"
  | "play"
  | "pause"

type RespondIconProps = HTMLAttributes<HTMLElement> & {
  name: RespondIconName
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
}

// Wrapper pro iconfont Respond.io. Renderiza um <i> com a classe correta.
// Sizes mapeados pro CSS: xs=12, sm=14, md=16, lg=18, xl=20, 2xl=24.
export function RespondIcon({
  name,
  size = "lg",
  className,
  ...rest
}: RespondIconProps) {
  return (
    <i
      aria-hidden="true"
      className={cn("icon", `icon-${name}`, `icon-${size}`, className)}
      {...rest}
    />
  )
}
