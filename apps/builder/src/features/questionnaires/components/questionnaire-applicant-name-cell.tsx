"use client"

import { ContactNameCell } from "@/features/contacts/components/contact-name-cell"

type QuestionnaireApplicantContact = {
  avatar?: string | null
  fullName?: string | null
}

export function QuestionnaireApplicantNameCell({
  contact,
  conversationId,
  workspaceId,
  unknownContactLabel,
}: {
  contact: QuestionnaireApplicantContact
  conversationId?: string | null
  workspaceId: string
  unknownContactLabel: string
}) {
  return (
    <ContactNameCell
      contact={contact}
      conversationId={conversationId}
      unknownContactLabel={unknownContactLabel}
      workspaceId={workspaceId}
    />
  )
}
