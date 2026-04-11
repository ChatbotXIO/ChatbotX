"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import { EmailDisconnect } from "./components/email-disconnect"
import type { listIntegrationEmails } from "./queries"

type EmailManageProps = {
  readonly workspaceId: string
  readonly promises: Promise<Awaited<ReturnType<typeof listIntegrationEmails>>>
}

export const EmailManage = ({ workspaceId, promises }: EmailManageProps) => {
  const { data: integrationEmails } = use(promises)
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary">
          <Link
            className="flex items-center gap-2"
            href={`/channels/create?channel=email&workspaceId=${workspaceId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: "Email" })}
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>From Address</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationEmails.map((integrationEmail) => (
              <TableRow key={integrationEmail.id}>
                <TableCell>{integrationEmail.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{integrationEmail.provider}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {integrationEmail.fromAddress}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <EmailDisconnect integrationEmail={integrationEmail} />
                </TableCell>
              </TableRow>
            ))}
            {integrationEmails.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>No data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
