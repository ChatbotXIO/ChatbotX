"use client"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
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
      <Card className="px-8">
        {folders}
        <Separator className="my-4" />
        {children}
      </Card>
    </>
  )
}
