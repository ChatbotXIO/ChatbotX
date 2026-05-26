"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ArrowUpRightIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { LifecycleStagePill } from "../../lifecycle-stages/lifecycle-stage-pill"
import { getTagChipStyle } from "../../tags/tag-colors"
import type { ListContactsItem } from "../schemas/query"
import { getAvatarInitials, getRespondAvatarUrl } from "../utils"

type ContactDetailDrawerProps = {
  workspaceId: string
  contact: ListContactsItem | null
  open: boolean
  onClose: () => void
}

// ISO 2-letter country code → bandeira emoji (regional indicator unicode).
function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) {
    return "🌐"
  }
  const upper = code.toUpperCase()
  const base = 0x1_f1_e6
  return (
    String.fromCodePoint(base + upper.charCodeAt(0) - 65) +
    String.fromCodePoint(base + upper.charCodeAt(1) - 65)
  )
}

/**
 * Drawer lateral 350px com detalhes do contato — pixel-perfect Respond.io
 * 2026-05-26 (Pedro pediu "ao clicar no contato abrir Detalhes"). Estrutura:
 *   • Header "Detalhes do contato" + close X
 *   • Avatar 56px + Nome + ID + país (bandeira)
 *   • Phone, Email, Locale (read-only)
 *   • Lifecycle stage pill
 *   • Etiquetas (chips)
 *   • Botão "Ver no Inbox" → /inbox?conversationId=X
 *
 * Versão MINIMAL — sem useChatStore, sem accordion. ContactDetail completo
 * (drawer do Inbox com inline edit, custom fields, sequences) ficou fora pra
 * evitar acoplamento com ChatStore (que só vive em /inbox).
 */
export function ContactDetailDrawer({
  workspaceId,
  contact,
  open,
  onClose,
}: ContactDetailDrawerProps) {
  const t = useTranslations()

  if (!(open && contact)) {
    return null
  }

  const name = contact.fullName || contact.phoneNumber || contact.email || "?"
  const avatar = getRespondAvatarUrl(name)
  const initials = getAvatarInitials(name)
  const tags = contact.tags ?? []

  return (
    <aside
      className={cn(
        "flex h-full w-[350px] shrink-0 flex-col overflow-hidden border-l bg-sidebar text-sidebar-foreground",
      )}
    >
      {/* Header — Pedro padrão Respond.io: título sentence case + close X */}
      <div className="flex h-[43px] shrink-0 items-center justify-between border-white/[0.06] border-b px-4">
        <h2 className="truncate font-semibold text-base">
          {t("contacts.drawer.title")}
        </h2>
        <Button
          aria-label={t("actions.close")}
          className="size-7 rounded-md text-text-secondary hover:bg-white/[0.06]"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Body scrollável */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Avatar + Nome */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <span
            className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-base text-white"
            style={{ backgroundColor: avatar.color }}
          >
            {/* biome-ignore lint/performance/noImgElement: avatar simples sem Next/Image */}
            <img
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover"
              height={56}
              src={avatar.url}
              width={56}
            />
            <span className="relative">{initials}</span>
          </span>
          <div className="flex flex-col items-center gap-1">
            <h3 className="font-semibold text-base">{name}</h3>
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <span>#{contact.id}</span>
              {contact.country && (
                <span aria-hidden className="text-base leading-none">
                  {countryCodeToFlag(contact.country)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lifecycle stage */}
        {contact.lifecycleStage && (
          <div className="mb-4 flex justify-center">
            <LifecycleStagePill stage={contact.lifecycleStage} />
          </div>
        )}

        {/* Etiquetas */}
        {tags.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <span className="font-medium text-text-secondary text-xs">
              {t("tags.title")}
            </span>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] leading-4"
                  key={tag.id}
                  style={getTagChipStyle(tag.color)}
                >
                  {tag.emoji && <span aria-hidden>{tag.emoji}</span>}
                  <span>{tag.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Info estática */}
        <div className="mb-4 flex flex-col gap-3">
          <DrawerField
            label={t("fields.phoneNumber.label")}
            value={contact.phoneNumber || "—"}
          />
          <DrawerField
            label={t("fields.email.label")}
            value={contact.email || "—"}
          />
          <DrawerField
            label={t("contacts.column.country")}
            value={
              contact.country
                ? `${countryCodeToFlag(contact.country)} ${contact.country}`
                : "—"
            }
          />
          <DrawerField
            label={t("contacts.column.language")}
            value={contact.locale || "—"}
          />
        </div>

        {/* Botão Ver no Inbox */}
        {contact.conversation?.id && (
          <Link
            className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-white/[0.12] px-3 py-2 font-medium text-sm text-text-secondary hover:bg-white/[0.06]"
            href={`/space/${workspaceId}/inbox?conversationId=${contact.conversation.id}`}
            target="_blank"
          >
            <ArrowUpRightIcon className="size-4" />
            {t("contacts.drawer.openInInbox")}
          </Link>
        )}
      </div>
    </aside>
  )
}

function DrawerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-normal text-[12px] text-text-secondary">
        {label}
      </span>
      <span className="break-words text-sm">{value}</span>
    </div>
  )
}
