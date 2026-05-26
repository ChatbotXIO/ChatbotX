"use client"

import type {
  MessageButtonTemplate,
  MessageTemplateEntity,
} from "@chatbotx.io/sdk"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@chatbotx.io/ui/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { format, isSameDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ExternalLinkIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { RespondIcon } from "@/components/respond-icon"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { useAttachmentUrl } from "@/features/attachments/utils"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
} from "@/features/contacts/utils"
import { useUserStore } from "@/features/users/provider/user-store-context"
import { authClient } from "@/lib/auth/auth-client"
import type { MessageResourceWithRelations } from "../schema/resource"
import { DateSeparator } from "./date-separator"
import { MessageBubble } from "./message-bubble"

type MessageItemProps = {
  message: MessageResourceWithRelations
  prevMessage?: MessageResourceWithRelations
  nextMessage?: MessageResourceWithRelations
  guestDisplay?: boolean
  onPostback?: (button: MessageButtonTemplate) => void
}

export const MessageItem = (props: MessageItemProps) => {
  const { message, prevMessage, nextMessage, guestDisplay = false } = props
  const t = useTranslations()

  // Comentário interno: bubble amarela só pra equipe. Pedro pediu pra usar
  // o padrão Respond.io (substitui Notas separadas).
  const isInternal = Boolean((message as { isInternal?: boolean }).isInternal)

  // Pixel-perfect Respond.io 2026-05-25 (FASE A):
  // - incoming (esquerda): bg #2F2F32, radius 8px, padding 4 (mais compacto)
  // - outgoing (direita):  bg #2C3A58, radius `8 4 4 8` (TL=8 TR=4 BR=4 BL=8)
  // - internal (comentário): bg amber-900 + border-l-amber-500
  // - text: 14px / 20px line-height
  // Cor do bubble interno (comentário) — pixel-perfect Respond.io
  // 2026-05-25 iteração 20: bg #3F3322 (mesmo do input amber), texto
  // amber-50, SEM border esquerdo. Antes era amber-950/80 + border
  // esquerdo amarelo que não bate com o print do Respond.io ao vivo.
  const variants: Record<"left" | "right" | "full", string> = {
    left: "px-3 py-1.5 rounded-[8px] bg-bubble-incoming text-foreground",
    right: isInternal
      ? "px-3 py-1.5 rounded-tl-[8px] rounded-tr-[4px] rounded-bl-[8px] rounded-br-[4px] bg-[#3F3322] text-amber-50"
      : "px-3 py-1.5 rounded-tl-[8px] rounded-tr-[4px] rounded-bl-[8px] rounded-br-[4px] bg-bubble-outgoing text-foreground",
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

  // Footer com HH:mm + ✓✓ azul (apenas pra outgoing). Estilo Respond.io.
  // Status entrega é placeholder visual até schema Message.deliveryStatus —
  // por enquanto toda outgoing aparece como "lida" (✓✓ azul).
  // 2026-05-24 — Sprint Inbox 2.1.
  const _showFooter = variant !== "full"
  const isOutgoing = message.messageType === "outgoing"

  // Avatar lateral (pixel-perfect Respond.io 2026-05-25 iteração 8):
  // aparece SÓ na ÚLTIMA mensagem da sequência (msgs consecutivas do
  // mesmo lado compartilham 1 avatar visual). Confirmado via Chrome MCP
  // no Respond.io ao vivo — uma msg-item com altura 338 px tem o avatar
  // em y=494 (33 px do bottom = alinhado com a última bubble). Pedro
  // pegou: minha versão anterior usava isFirstInSequence (avatar na 1ª)
  // que fazia o avatar parecer "soltinho" embaixo das outras. Quando não
  // é a última, deixa um spacer de 32 px pra preservar alinhamento.
  const isLastInSequence =
    !nextMessage || nextMessage.messageType !== message.messageType

  // FASE B (2026-05-25): mostra separador "Hoje" / "Ontem" / data quando
  // a mensagem cai num dia diferente da anterior. Também na PRIMEIRA
  // mensagem do chat (sem prevMessage).
  const showDateSeparator = !(
    prevMessage &&
    isSameDay(new Date(prevMessage.createdAt), new Date(message.createdAt))
  )

  // Pedro 2026-05-25 iter 41: avatar consistente em TODOS os lugares.
  // Bug anterior: `message.contact` vinha sem fullName populated, então
  // seed caía em "?" → todo avatar de bubble ficava deep-orange (cor do
  // hash de "?"). Agora puxamos contact do chatStore (sempre tem nome)
  // e user do userStore.workspaceMembers (sempre tem nome).
  //
  // Seed do hash: SEMPRE `id` (snowflake imutável). Antes era
  // `name || id` → se name mudasse, avatar mudava de cor. Agora trava
  // no id pra ser determinístico forever.
  const activeContact = useChatStore(
    (state) =>
      state.conversations.find((c) => c.id === message.conversationId)
        ?.contact ?? null,
  )
  const workspaceMembers = useUserStore((state) => state.workspaceMembers)
  const session = authClient.useSession()
  const currentSessionUser = session?.data?.user ?? null

  const sideAvatarPayload = (() => {
    if (variant === "full") {
      return null
    }
    if (variant === "left") {
      // incoming → contato (resolve do chatStore, NÃO do message.contact)
      const contact = activeContact ?? message.contact
      const name = contact?.fullName ?? ""
      const seed = String(contact?.id ?? name)
      const avatarSpec = getRespondAvatarUrl(seed)
      return {
        image:
          (contact as { avatar?: string | null } | undefined)?.avatar ?? null,
        name,
        initials: getAvatarInitials(name) || "?",
        color: avatarSpec.color,
        seedUrl: avatarSpec.url,
      }
    }
    // outgoing → agente. Pedro iter 41: fallback em 3 níveis pra avatar
    // consistente mesmo quando o backend não popula senderId/user:
    //   1. senderId (FK no DB) → resolve via workspaceMembers
    //   2. message.user (relation populada)
    //   3. session.user (currentUser logado) — pra msgs antigas com
    //      senderId NULL no banco (seed data).
    const senderId = (message as { senderId?: string | null }).senderId ?? null
    const memberFromStore = senderId
      ? workspaceMembers.find((m) => String(m.user.id) === String(senderId))
          ?.user
      : null
    const messageUser = message.user
    const user = memberFromStore ?? messageUser ?? currentSessionUser
    const name =
      user?.name ?? messageUser?.email ?? currentSessionUser?.email ?? ""
    // Seed estável = senderId (FK imutável) com fallbacks pelo user resolvido.
    const seed = String(senderId ?? user?.id ?? currentSessionUser?.id ?? name)
    const avatarSpec = getRespondAvatarUrl(seed)
    return {
      image: user?.image ?? null,
      name,
      initials: getAvatarInitials(name) || "?",
      color: avatarSpec.color,
      seedUrl: avatarSpec.url,
    }
  })()

  // Hover actions (Inbox 2.2) — menu "..." em cima da bubble com:
  //   Copy texto | Copy link mensagem | Reply (placeholder)
  // Aparece só no hover via grupos do Tailwind.
  const handleCopy = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text)
      toast.success(t("messages.actions.copied"))
    }
  }
  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?conversationId=${message.conversationId}#msg-${message.id}`
    navigator.clipboard.writeText(url)
    toast.success(t("messages.actions.linkCopied"))
  }

  return (
    <div>
      {showDateSeparator && <DateSeparator date={message.createdAt} />}
      <MessageBubble
        title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
        variant={variant}
      >
        {/* Avatar lateral (32 px) — só na PRIMEIRA da sequência. Quando não
          é a primeira, mantém um spacer da mesma largura pra preservar
          alinhamento vertical (igual Respond.io). System messages (full)
          não têm avatar. */}
        {/* Avatar wrapper SEM pb-1 (Pedro 2026-05-25 iteração 7):
          Respond.io alinha avatar no bottom da bubble via items-end no
          parent, sem padding extra. pb-1 estava criando desalinhamento. */}
        {variant !== "full" && sideAvatarPayload && (
          <div className="shrink-0 self-end">
            {isLastInSequence ? (
              <Avatar className="size-8">
                <AvatarImage
                  alt={sideAvatarPayload.name}
                  className="object-cover"
                  src={sideAvatarPayload.image ?? sideAvatarPayload.seedUrl}
                />
                <AvatarFallback
                  className="font-medium text-[12px] text-white"
                  style={{ backgroundColor: sideAvatarPayload.color }}
                >
                  {sideAvatarPayload.initials}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div aria-hidden="true" className="size-8" />
            )}
          </div>
        )}
        {/* Bubble wrapper SEM mx-2 (Pedro 2026-05-25 iteração 7) +
          SEM min-h-11 (Pedro 2026-05-25 iteração 9):
          - min-h-11 (44 px) forçava altura mínima maior que 1 linha de
            texto (~30 px), criando espaço vazio embaixo do bubble. O
            avatar `self-end` ia pro fundo desse espaço, ficando ABAIXO
            da bubble visualmente. Sem min-h, a bubble se ajusta ao
            conteúdo e o avatar encosta no bottom REAL dela.
          - mx-2 estava dobrando o gap-2 pra 16 px. */}
        <div className="group/msg flex max-w-[60%] flex-col gap-1">
          {message.text && message.text.length > 0 && (
            <div className="relative">
              {/* FASE A/B revisão (Pedro 2026-05-25):
                - Hora REMOVIDA de dentro/embaixo da bubble — agora aparece
                  só em TOOLTIP no hover (com Enviado/Entregue/Lido detalhado).
                - ✓✓ status entrega vai FORA da bubble, à ESQUERDA dela
                  (apenas pra outgoing). Confirmado via Chrome MCP no
                  Respond.io ao vivo + doc managing-conversations.md.
                - Cor ✓✓ lida = #6BA4FF (primary azul Respond.io). */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-end gap-1.5",
                      variant === "right" ? "flex-row" : "flex-row-reverse",
                    )}
                  >
                    {/* ✓✓ status entrega — só pra outgoing NÃO-INTERNA.
                      Pedro 2026-05-25 iteração 20: comentários internos
                      são mensagens só pra equipe (não vão pro contato),
                      então NÃO mostram delivery status. Igual Respond.io. */}
                    {isOutgoing && variant === "right" && !isInternal && (
                      <RespondIcon
                        className="shrink-0 text-primary"
                        name="message-delivered"
                        size="lg"
                      />
                    )}
                    <div className={cn("text-sm", variants[variant])}>
                      <pre className="whitespace-pre-line break-words font-sans">
                        {message.text}
                      </pre>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  align={variant === "right" ? "end" : "start"}
                  className="border border-black/[0.06] bg-white px-3 py-2 text-foreground shadow-md dark:border-white/[0.08] dark:bg-white dark:text-neutral-900"
                  side="top"
                >
                  <DeliveryTooltipContent
                    createdAt={message.createdAt}
                    isInternal={isInternal}
                    isOutgoing={isOutgoing}
                  />
                </TooltipContent>
              </Tooltip>
              {variant !== "full" && (
                <div
                  className={cn(
                    "absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100",
                    variant === "right" ? "-left-24" : "-right-24",
                  )}
                >
                  {/* 3 ÍCONES INLINE (Pedro 2026-05-25 iteração 10):
                    copy, link-1, reply do iconsax — mesmos que Respond.io
                    usa. Substituiu o dropdown ⋯ por 3 botões discretos
                    aparecendo no hover, lado oposto ao avatar. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("messages.actions.copy")}
                        className="size-7 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                        onClick={handleCopy}
                        size="icon"
                        variant="ghost"
                      >
                        <RespondIcon name="copy" size="md" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t("messages.actions.copy")}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("messages.actions.copyLink")}
                        className="size-7 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                        onClick={handleCopyLink}
                        size="icon"
                        variant="ghost"
                      >
                        <RespondIcon name="link-1" size="md" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t("messages.actions.copyLink")}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("messages.actions.reply") ?? "Reply"}
                        className="size-7 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                        size="icon"
                        variant="ghost"
                      >
                        <RespondIcon name="reply" size="md" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t("messages.actions.reply") ?? "Responder"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <RenderAttachments message={message} />
          )}
          <RenderLocation message={message} />
          {RenderContentAttributes(props)}
          {/* Footer COMPLETAMENTE REMOVIDO 2026-05-25 (Pedro feedback):
            hora não aparece mais visível na bubble — só em Tooltip on
            hover. ✓✓ já está renderizado FORA da bubble (lado esquerdo
            da outgoing). Attachments/locations sem texto também usam
            esse mesmo padrão. */}
        </div>
      </MessageBubble>
    </div>
  )
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

// Regex top-level (regra biome useTopLevelRegex).
const FIRST_WORD_CHAR = /^(\w)/

// Formata bytes pra "1.2 MB" / "543 KB" etc. (Sprint Inbox 2.3)
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B"
  }
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** i
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

const RenderAttachmentItem = (props: { attachment: AttachmentResource }) => {
  const { attachment } = props
  const attachmentUrl = useAttachmentUrl(attachment)
  const attachmentLabel =
    attachment.name || attachment.originPath || "Attachment"

  if (!attachmentUrl) {
    return (
      <div className="flex items-center gap-2 overflow-hidden rounded-xl bg-secondary p-3 text-sm">
        <RespondIcon name="attach-square" size="lg" />
        <span className="truncate">{attachmentLabel}</span>
      </div>
    )
  }

  // Detectar sticker pelo mimeType WhatsApp ou extensão (.webp animado).
  // Sticker renderiza grande sem fundo (Inbox 2.3).
  const isSticker =
    attachment.mimeType === "image/webp" &&
    (attachment.name?.toLowerCase().includes("sticker") ||
      (attachment.width === 512 && attachment.height === 512))

  switch (attachment.fileType) {
    case "image":
      if (isSticker) {
        return (
          <Image
            alt={attachmentLabel}
            className="size-32 object-contain"
            height={attachment.height || 128}
            src={attachmentUrl}
            width={attachment.width || 128}
          />
        )
      }
      return (
        <Image
          alt={attachmentLabel}
          className="max-w-80 rounded-xl"
          height={attachment.height || 0}
          src={attachmentUrl}
          width={attachment.width || 0}
        />
      )
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
      // Documento card rico (Sprint Inbox 2.3): ícone + nome + tamanho + download.
      return (
        <Link
          className="flex max-w-80 items-center gap-3 rounded-xl bg-secondary/60 p-3 text-sm transition-colors hover:bg-secondary"
          href={attachmentUrl}
          target="_blank"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card text-primary">
            <RespondIcon name="document" size="xl" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{attachmentLabel}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {attachment.mimeType && (
                <span className="uppercase">
                  {attachment.mimeType.split("/")[1]?.slice(0, 6)}
                </span>
              )}
              {attachment.size > 0 && (
                <span>{formatBytes(attachment.size)}</span>
              )}
            </div>
          </div>
          <RespondIcon
            className="shrink-0 text-muted-foreground"
            name="received"
            size="md"
          />
        </Link>
      )
  }
}

// Renderiza tipo "location" — card com mini-mapa estático (OpenStreetMap)
// + link pro Google Maps. Lat/lng vêm em message.contentAttributes.
// Sprint Inbox 2.3.
const RenderLocation = ({
  message,
}: {
  message: MessageResourceWithRelations
}) => {
  const attrs = message.contentAttributes as
    | {
        type?: string
        latitude?: number
        longitude?: number
        name?: string
        address?: string
      }
    | undefined
  if (
    !attrs ||
    attrs.type !== "location" ||
    typeof attrs.latitude !== "number" ||
    typeof attrs.longitude !== "number"
  ) {
    return null
  }
  const { latitude, longitude, name, address } = attrs
  const bbox = `${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}`
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`
  const gmapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`
  return (
    <Link
      className="block max-w-80 overflow-hidden rounded-xl bg-secondary/60 hover:bg-secondary"
      href={gmapsUrl}
      target="_blank"
    >
      <iframe
        className="block h-32 w-full border-0"
        loading="lazy"
        src={mapUrl}
        title={name || "Localização"}
      />
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 font-medium text-sm">
          <RespondIcon name="global" size="md" />
          {name || "Localização"}
        </div>
        {address && (
          <div className="mt-0.5 truncate text-muted-foreground text-xs">
            {address}
          </div>
        )}
      </div>
    </Link>
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
        // FASE D (2026-05-25) — quick replies pixel-perfect Respond.io:
        // pílulas inline 24 px, bg white/8%, text muted-foreground, 12 px /
        // 400, padding 4 8, radius 4 px. flex-wrap pra quebrar linha
        // quando tem muitos botões. Substitui o min-w-60 outline antigo.
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {contentAttributes.payload.templateType === "button" &&
            contentAttributes.payload.buttons.map((button) => {
              if (button.buttonType === "url") {
                return (
                  <Button
                    asChild
                    className="h-6 gap-1 rounded-[4px] border-0 bg-white/[0.08] px-2 font-normal text-[12px] text-text-secondary hover:bg-white/[0.16] hover:text-foreground"
                    key={button.id}
                    size="sm"
                    variant="ghost"
                  >
                    <Link href={button.url} target="_blank">
                      <ExternalLinkIcon className="size-3" />
                      {button.label}
                    </Link>
                  </Button>
                )
              }
              return (
                <Button
                  className="h-6 rounded-[4px] border-0 bg-white/[0.08] px-2 font-normal text-[12px] text-text-secondary hover:bg-white/[0.16] hover:text-foreground disabled:opacity-60"
                  disabled={!onPostback}
                  key={button.id}
                  onClick={() => {
                    onPostback?.(button)
                  }}
                  size="sm"
                  variant="ghost"
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

// Conteúdo do Tooltip de hover — Pedro 2026-05-25 iteração 10:
// pixel-perfect Respond.io (BRANCO, texto preto, 2 colunas alinhadas).
// Label "Enviado:" / "Entregue:" / "Lido:" coluna esquerda, valor
// "Hoje, HH:mm:ss" / "Ontem, HH:mm:ss" / "Segunda, HH:mm:ss" direita.
// Bg do TooltipContent já vem branco via className no caller.
// Mock dos timestamps até schema Message.deliveryStatus existir
// (sentAt/deliveredAt/readAt). Por enquanto: sentAt = createdAt,
// deliveredAt = createdAt + 3s, readAt = createdAt + 1 min.
function DeliveryTooltipContent({
  createdAt,
  isOutgoing,
  isInternal = false,
}: {
  createdAt: Date | string
  isOutgoing: boolean
  isInternal?: boolean
}) {
  const t = useTranslations()
  const base = new Date(createdAt)

  // Formato Respond.io: "Hoje, 5:32:22 PM" / "Ontem, ..." / "Segunda, ..."
  const fmtRelative = (d: Date) => {
    const now = new Date()
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const wasYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    const timePart = format(d, "h:mm:ss a", { locale: ptBR })
    if (sameDay) {
      return `Hoje, ${timePart}`
    }
    if (wasYesterday) {
      return `Ontem, ${timePart}`
    }
    const dayName = format(d, "EEEE", { locale: ptBR }).replace(
      FIRST_WORD_CHAR,
      (s) => s.toUpperCase(),
    )
    return `${dayName}, ${timePart}`
  }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline gap-3">
      <span className="font-semibold text-neutral-900">{label}:</span>
      <span className="text-neutral-700">{value}</span>
    </div>
  )

  // Comentários internos: só "Enviado" (não vão pro contato, então
  // sem entregue/lido). Pedro 2026-05-25 iteração 20.
  if (isInternal) {
    return (
      <div className="space-y-1 text-[13px] leading-tight">
        <Row
          label={t("messages.tooltip.sent") ?? "Enviado"}
          value={fmtRelative(base)}
        />
      </div>
    )
  }

  if (!isOutgoing) {
    return (
      <div className="space-y-1 text-[13px] leading-tight">
        <Row
          label={t("messages.tooltip.received") ?? "Recebido"}
          value={fmtRelative(base)}
        />
      </div>
    )
  }

  const sentAt = base
  const deliveredAt = new Date(base.getTime() + 3 * 1000)
  const readAt = new Date(base.getTime() + 60 * 1000)

  return (
    <div className="space-y-1 text-[13px] leading-tight">
      <Row
        label={t("messages.tooltip.sent") ?? "Enviado"}
        value={fmtRelative(sentAt)}
      />
      <Row
        label={t("messages.tooltip.delivered") ?? "Entregue"}
        value={fmtRelative(deliveredAt)}
      />
      <Row
        label={t("messages.tooltip.read") ?? "Lido"}
        value={fmtRelative(readAt)}
      />
    </div>
  )
}
