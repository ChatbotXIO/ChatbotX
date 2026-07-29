"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { useAvatarUrl } from "@/features/contacts/utils"
import type { listQuestionnaireSubmissions } from "../queries"

type Submission = Awaited<
  ReturnType<typeof listQuestionnaireSubmissions>
>["data"][number]

export function QuestionnaireApplicantAvatarCell({
  contact,
  onClick,
  unknownContactLabel,
}: {
  contact: Pick<Submission["contact"], "avatar" | "fullName">
  onClick: () => void
  unknownContactLabel: string
}) {
  const avatarUrl = useAvatarUrl(contact as Parameters<typeof useAvatarUrl>[0])
  const name = contact.fullName ?? unknownContactLabel

  return (
    <button
      className="flex size-8 items-center justify-center"
      onClick={onClick}
      type="button"
    >
      <Avatar className="size-8">
        <AvatarImage alt={name} className="object-cover" src={avatarUrl} />
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
    </button>
  )
}
