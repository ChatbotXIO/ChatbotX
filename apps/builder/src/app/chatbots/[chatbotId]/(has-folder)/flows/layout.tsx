"use client"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

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
    <FolderStoreProvider chatbotId={chatbotId} folderType="flow">
      <Card>
        <CardContent className="flex items-center gap-8">
          <Link
            className="font-medium text-sm"
            href={`/chatbots/${chatbotId}/tags`}
          >
            {t("tags.heading.title")}
          </Link>
          <Link
            className="font-medium text-sm"
            href={`/chatbots/${chatbotId}/custom-fields`}
          >
            {t("customField.heading.title")}
          </Link>
          <Link
            className="font-medium text-sm"
            href={`/chatbots/${chatbotId}/error-logs`}
          >
            {t("errorLog.heading.title")}
          </Link>
        </CardContent>
      </Card>

      <Card className="px-8">{folders}</Card>

      <Card className="px-8">{children}</Card>
    </FolderStoreProvider>
  )
}
