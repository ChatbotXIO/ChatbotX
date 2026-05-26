"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { useEffect, useMemo, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactDetail } from "./contact-detail"
import type { GetContactResponse } from "./schemas/query"

// Painel direito pixel-perfect Respond.io 2026-05-25 iteração 31 (Pedro):
// REMOVIDO: Notas, Ciclo de vida, Histórico de etapas, Sequências.
// Respond.io só tem Header + Campos de contatos (rolável) + Etiquetas
// (fixa embaixo). Tudo aqui agora é só wrapper de `<ContactDetail>`.
export const ContactInboxPanel = ({
  workspaceId,
  activeConversationId,
  hiddenFieldKeys = [],
}: {
  workspaceId: string
  activeConversationId: string | null
  // Mantido na assinatura por compat com chat-layout, mesmo que esta
  // versão não use mais (já que removemos lifecycle do drawer).
  lifecycleStages?: LifecycleStageModel[]
  /** Keys de fields marcadas como `alwaysHide` no workspace. */
  hiddenFieldKeys?: string[]
}) => {
  const { conversations } = useChatStore((state) => state)

  const storeContact = useMemo(
    () =>
      conversations.find((c) => c.id === activeConversationId)?.contact ?? null,
    [conversations, activeConversationId],
  )

  const [contactData, setContactData] = useState<GetContactResponse | null>(
    null,
  )

  useEffect(() => {
    const contactId = storeContact?.id

    if (!activeConversationId) {
      setContactData(null)
      return
    }

    if (!contactId) {
      setContactData(null)
      return
    }

    client.contactsAPIs
      .getContactAuthenticatedAPI({ workspaceId, contactId })
      .then((data) => {
        setContactData(data)
      })
      .catch(() => {
        setContactData(null)
      })
  }, [activeConversationId, storeContact?.id, workspaceId])

  if (!storeContact) {
    return null
  }

  return (
    <ContactDetail
      activeConversationId={activeConversationId}
      contact={contactData}
      hiddenFieldKeys={hiddenFieldKeys}
      onTagsChange={(updatedTags) => {
        if (contactData) {
          setContactData({ ...contactData, tags: updatedTags })
        }
      }}
    />
  )
}
