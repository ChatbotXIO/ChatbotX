"use client"
import { Card } from "@aha.chat/ui/components/ui/card"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

export default function FolderableLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  return (
    <>
      <Card>
        <div className="flex items-center gap-8 px-8">
          <Link className="text-gray-600" href={`/chatbots/${chatbotId}/tags`}>
            {t("tags.heading.title")}
          </Link>
          <Link
            className="text-gray-600"
            href={`/chatbots/${chatbotId}/custom-fields`}
          >
            {t("customField.heading.title")}
          </Link>
          <Link
            className="text-gray-600"
            href={`/chatbots/${chatbotId}/error-logs`}
          >
            {t("errorLog.heading.title")}
          </Link>
        </div>
      </Card>
      <Card className="px-8">
        {folders}
        <Separator className="my-4" />
        {children}
      </Card>
    </>
  )
}
