"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { AtSignIcon, PhoneIcon, TextIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RespondIcon } from "@/components/respond-icon"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { customFieldIconsMap } from "../custom-fields/provider/custom-field-hook"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import type { TagResource } from "../tags/schema/resource"
import { ContactTagsPanel } from "./components/contact-tags-panel"
import { InlineContactField } from "./components/inline-contact-field"
import type { GetContactResponse } from "./schemas/query"
import type { ContactEditableField } from "./schemas/resource"
import { getAvatarInitials, getRespondAvatarUrl, useAvatarUrl } from "./utils"

// Painel direito pixel-perfect Respond.io 2026-05-24 — Pedro reclamou que
// removi tudo (avatar, nome, header, canais, etiquetas) na refatoração
// anterior. Restaurando estrutura 1:1 com print do amigo:
//   1. Header "Detalhes do contato"
//   2. Avatar pequeno + Nome + (ID · 🇧🇷)  [menu …]
//   3. Administrador: [link azul com nome do assignee]
//   4. Canais  (botão expandível com bolinha verde WhatsApp)
//   5. Campos de contatos  [✏️]   (lista de campos editáveis inline)
//   6. Etiquetas  (chips coloridos + "Adicionar etiqueta")
export const ContactDetail = ({
  activeConversationId,
  contact,
  hiddenFieldKeys = [],
  onTagsChange,
}: {
  activeConversationId: string | null
  contact: GetContactResponse | null
  /** Lista de `fieldKey`s ocultas pelo workspace (Personalizar visualização). */
  hiddenFieldKeys?: string[]
  onTagsChange?: (tags: TagResource[]) => void
}) => {
  const t = useTranslations()

  const workspaceId = useWorkspaceId()
  const { conversations } = useChatStore((state) => state)
  const avatarUrl = useAvatarUrl(contact)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  const { customFields, initialized: initializedCustomFields } =
    useCustomFieldStore((state) => state)

  const [contactFields, setContactFields] = useState<ContactEditableField[]>([])

  const handleCustomFieldUpdated = (customFieldId: string, value: string) => {
    setContactFields((previous) =>
      previous.map((field) =>
        field.key === customFieldId ? { ...field, value } : field,
      ),
    )
  }

  // Pedro 2026-05-25 iteração 32: pixel-perfect Respond.io.
  // No Respond.io, TODOS os custom fields do workspace já aparecem
  // listados na lateral do contato (mesmo sem valor preenchido).
  // NÃO existe botão "Adicionar Campo Personalizado" no drawer.
  // Campos vazios mostram placeholder "Adicionar {label}" e clicar
  // edita inline. Workspace admin gerencia o catálogo via página
  // /custom-fields (link "Administrar" no header da seção).
  useEffect(() => {
    if (!(activeConversationId && initializedCustomFields)) {
      setContactFields([])
      return
    }

    const conversation = conversations.find(
      (item) => item.id === activeConversationId,
    )

    if (!conversation?.contact) {
      setContactFields([])
      return
    }

    // Ordem Pedro 2026-05-25 iteração 30: Telefone → Nome → Sobrenome → Email
    const tmpContactFields: ContactEditableField[] = [
      {
        key: "phoneNumber",
        icon: PhoneIcon,
        label: "Número de Telefone",
        value: conversation.contact.phoneNumber,
        type: "shortText",
      },
      {
        key: "firstName",
        icon: TextIcon,
        label: "Nome",
        value: conversation.contact.firstName,
        type: "shortText",
      },
      {
        key: "lastName",
        icon: TextIcon,
        label: "Sobrenome",
        value: conversation.contact.lastName,
        type: "shortText",
      },
      {
        key: "email",
        icon: AtSignIcon,
        label: "Email",
        value: conversation.contact.email,
        type: "shortText",
      },
    ]

    // Map dos valores já preenchidos pelo contato (chave = customField.id)
    const contactCustomValuesMap = new Map(
      (contact?.customFields ?? []).map((f) => [f.id, f.value]),
    )

    // Iteração 32 (Pedro): listar TODOS os custom fields do workspace
    // (não só os do contato). Campos sem valor mostram placeholder e
    // ficam editáveis inline — igual Respond.io.
    for (const targetCustomField of customFields) {
      const cf = targetCustomField as unknown as {
        id: string
        name: string
        type: string
        visibility?: "alwaysShow" | "alwaysHide" | "hideWhenEmpty"
        values?: string[]
      }
      tmpContactFields.push({
        key: cf.id.toString(),
        icon: customFieldIconsMap[cf.type as CustomFieldType],
        label: cf.name,
        value: contactCustomValuesMap.get(cf.id.toString()) ?? "",
        type: cf.type as CustomFieldType,
        visibility: cf.visibility,
        options: cf.values ?? [],
      })
    }

    setContactFields(tmpContactFields)
  }, [
    activeConversationId,
    conversations,
    initializedCustomFields,
    contact,
    customFields,
  ])

  // Bandeira por código ISO do país (BR → 🇧🇷). Mais discreto que <img>.
  const countryFlag =
    typeof contact?.country === "string" && contact.country.length === 2
      ? String.fromCodePoint(
          ...contact.country
            .toUpperCase()
            .split("")
            .map((c) => 0x1_f1_e6 - 65 + c.charCodeAt(0)),
        )
      : null

  if (!contact) {
    return null
  }

  const fullName = contact.fullName ?? ""
  // Iter 41: seed = ID (consistente com conv-list + topbar + bubble).
  const respondAvatar = getRespondAvatarUrl(contact.id ?? fullName)
  const initials = getAvatarInitials(fullName)

  const _assignedUserName =
    activeConversation?.assignedUser?.name ||
    activeConversation?.assignedUser?.email ||
    "—"

  // Tags do contato (vem de GetContactResponse já com color/emoji/name)
  const tags = contact.tags ?? []

  // Separa fields em visíveis e ocultos (Pedro iter 33 + gap #10 Fase D).
  // Dois sistemas combinados:
  //   1. hiddenFieldKeys (workspace-contact-field-visibility) = override
  //      POR USUÁRIO do workspace. Tem prioridade.
  //   2. customField.visibility (global no field) = setting global do admin.
  //      alwaysHide vai pro accordion. hideWhenEmpty SUMRINDO quando value
  //      vazio (paridade Respond.io).
  const hiddenSet = new Set(hiddenFieldKeys)
  const visibleFields = contactFields.filter((f) => {
    if (hiddenSet.has(f.key)) {
      return false
    }
    if (f.visibility === "alwaysHide") {
      return false
    }
    if (f.visibility === "hideWhenEmpty" && !f.value?.trim()) {
      return false
    }
    return true
  })
  const hiddenFields = contactFields.filter(
    (f) => hiddenSet.has(f.key) || f.visibility === "alwaysHide",
  )

  return (
    /* Layout 3 zonas (Pedro 2026-05-25 iteração 31, pixel-perfect Respond.io):
         - Header fixo no topo (shrink-0): "Detalhes do contato" + avatar+nome
         - Middle rolável (flex-1 overflow-y-auto): "Campos de contatos"
         - Footer fixo embaixo (shrink-0): "Etiquetas" + chips
       O container pai (chat-layout) precisa ter height fixa (h-full) e SEM
       overflow-y-auto pra que a rolagem aconteça aqui dentro.
       `min-w-0` (iter 37) é obrigatório pra valores longos não estourarem. */
    <div className="flex h-full min-w-0 flex-col">
      {/* ── ZONA 1: HEADER FIXO ───────────────────────────────────────── */}
      <div className="shrink-0">
        {/* "Detalhes do contato" — sentence case + size 16 semibold. */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-[16px] text-text-secondary">
            {t("contacts.details")}
          </h3>
        </div>

        {/* Bloco principal: avatar 40 + nome + ID + bandeira.
            Pedro 2026-05-25 iteração 30: TUDO FUNCIONAL.
            - Ícones COPY + EDIT no hover do nome.
              • copy → copia o nome pra clipboard
              • edit → foca no input do firstName logo abaixo */}
        <div className="group/name mb-3 flex items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-white/[0.04]">
          <Avatar className="size-10 shrink-0">
            <AvatarImage alt={fullName} src={avatarUrl || respondAvatar.url} />
            <AvatarFallback
              className="font-medium text-[13px] text-white"
              style={{ backgroundColor: respondAvatar.color }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {/* Iter 39: weight 700 (bold) match Respond.io. Antes era
                font-semibold (600). 14px / leading-[22px] / #CFD3D8. */}
              <span className="truncate font-bold text-[14px] text-text-secondary leading-[22px]">
                {fullName || "—"}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/name:opacity-100">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("messages.actions.copy") ?? "Copiar"}
                      className="size-6 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                      onClick={() => {
                        if (!fullName) {
                          return
                        }
                        navigator.clipboard.writeText(fullName)
                        toast.success(t("messages.actions.copied") ?? "Copiado")
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <RespondIcon name="copy" size="sm" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t("messages.actions.copy") ?? "Copiar"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("actions.edit") ?? "Editar"}
                      className="size-6 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                      onClick={() => {
                        // Foca no input do firstName (que tá renderizado abaixo
                        // como InlineContactField). Usa querySelector pelo
                        // placeholder/type pra encontrar.
                        const el = document.querySelector<HTMLInputElement>(
                          'input[type="text"][placeholder*="Nome"]',
                        )
                        el?.focus()
                        el?.select()
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <RespondIcon name="edit" size="sm" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t("actions.edit") ?? "Editar"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            {/* Iter 39: ID = 12px / weight 400 / cor #CFD3D8 (NÃO muted).
              Antes era 11px text-muted-foreground (#97A0AA). */}
            <div className="flex items-center gap-2 text-[12px] text-text-secondary">
              <span className="font-mono">ID: {contact.id}</span>
              {countryFlag && <span className="text-sm">{countryFlag}</span>}
            </div>
          </div>
        </div>
      </div>
      {/* ── /ZONA 1 ─────────────────────────────────────────────────── */}

      {/* ── ZONA 2: CAMPOS DE CONTATOS (ROLÁVEL) ────────────────────── */}
      <div className="-mx-4 flex-1 overflow-y-auto px-4">
        {/* Campos de contatos — link real "Administrar" → /custom-fields
            (Pedro 2026-05-25 iteração 29: TUDO FUNCIONAL — agora é Link
            Next que navega pra página de custom fields do workspace). */}
        <div className="mb-2 flex items-center justify-between gap-2 border-border border-t pt-3">
          <h4 className="min-w-0 truncate font-semibold text-[14px] text-text-secondary">
            {t("contacts.fieldsTitle")}
          </h4>
          <Link
            aria-label={t("contacts.admin")}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-[13px] text-primary hover:underline"
            href={`/space/${workspaceId}/custom-fields`}
            title={t("contacts.admin")}
          >
            <span className="@[260px]/drawer:inline hidden">
              {t("contacts.admin")}
            </span>
            <RespondIcon name="link-1" size="sm" />
          </Link>
        </div>
        {/* Contact fields INLINE editáveis — pixel-perfect Respond.io
            2026-05-25 iteração 30 (Pedro): cada field é input direto
            (não abre modal). Save on blur ou Enter. Custom fields usam
            InlineContactField padronizado. Label em CIMA muted (12px 600),
            valor em BAIXO maior (14px). Phone tem bandeira automática. */}
        {/* Lista os custom fields do workspace VISÍVEIS (Pedro iter 33).
            Hidden vão pro accordion "Campos de contato ocultos" abaixo. */}
        <div className="mb-4 flex flex-col gap-3">
          {visibleFields.map((editable) => (
            <InlineContactField
              contactId={contact.id}
              field={editable}
              key={editable.key}
              onUpdated={handleCustomFieldUpdated}
              workspaceId={workspaceId}
            />
          ))}
        </div>

        {/* Accordion "Campos de contato ocultos" — Pedro iter 33.
            Mostra fields marcados como `alwaysHide` no Personalizar
            visualização (Settings → Campos de contatos). Só aparece
            se houver pelo menos 1 hidden. Mesmo editor inline dos
            visíveis quando expandido. */}
        {hiddenFields.length > 0 && (
          <Accordion
            className="-mx-1 mb-4 border-border border-t"
            collapsible
            type="single"
          >
            <AccordionItem className="border-0" value="hidden">
              {/* Iter 39: weight 500 (medium), match Respond.io.
                  Antes era font-semibold (600) — pareciam negrito. */}
              <AccordionTrigger className="rounded-none px-1 py-2.5 font-medium text-[14px] text-text-secondary transition-colors hover:bg-white/[0.04] hover:no-underline data-[state=open]:bg-white/[0.02]">
                {t("contacts.hiddenFields") ?? "Campos de contato ocultos"}
              </AccordionTrigger>
              <AccordionContent className="px-1 pt-2 pb-1">
                <div className="flex flex-col gap-3">
                  {hiddenFields.map((editable) => (
                    <InlineContactField
                      contactId={contact.id}
                      field={editable}
                      key={editable.key}
                      onUpdated={handleCustomFieldUpdated}
                      workspaceId={workspaceId}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
      {/* ── /ZONA 2 ─────────────────────────────────────────────────── */}

      {/* ── ZONA 3: ETIQUETAS (FIXA EMBAIXO) ────────────────────────── */}
      {/* Pedro 2026-05-25 iteração 31 (pixel-perfect Respond.io):
          Etiquetas é a última seção do drawer e fica FIXA embaixo.
          A área Campos de Contatos (Zona 2) rola; Etiquetas não.
          UpdateContactTagField gerencia add/remove com persistência. */}
      {onTagsChange && (
        <div className="shrink-0 border-border border-t pt-3 pb-1">
          {/* Iter 39: "Etiquetas" h4 = weight 700 (bold) no Respond.io.
              Antes era font-semibold (600). */}
          <h4 className="mb-2 font-bold text-[14px] text-text-secondary">
            {t("contacts.tagsTitle")}
          </h4>
          <TagStoreProvider workspaceId={workspaceId}>
            <ContactTagsPanel
              appliedTags={tags}
              contactId={contact.id}
              onUpdated={onTagsChange}
              workspaceId={workspaceId}
            />
          </TagStoreProvider>
        </div>
      )}
      {/* ── /ZONA 3 ─────────────────────────────────────────────────── */}
    </div>
  )
}
