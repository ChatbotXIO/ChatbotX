"use client"

import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@aha.chat/ui/components/ui/table"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import type { findWhatsappAutomation } from "./queries"

type WhatsappAutomationManageProps = {
  integrationWhatsapp: IntegrationWhatsappModel
  promises: Promise<[Awaited<ReturnType<typeof findWhatsappAutomation>>]>
}

export function WhatsappAutomationManage({
  integrationWhatsapp,
  promises,
}: WhatsappAutomationManageProps) {
  const t = useTranslations()
  const [{ prompts, commands }] = use(promises)

  const auth = integrationWhatsapp.auth as unknown as WhatsappAuthValue
  const managerUrl = `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex">
          <h4 className="flex-1 font-medium">
            {t("whatsapp.icebreakers.label")}
          </h4>
          <Button asChild size="sm" variant="secondary">
            <Link href={managerUrl} rel="noopener" target="_blank">
              {t("actions.manage")}
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("whatsapp.icebreakers.description")}
        </p>
        <div className="rounded-md border">
          <Table>
            <TableBody>
              {prompts.map((prompt) => (
                <TableRow key={prompt}>
                  <TableCell>{prompt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex">
          <h4 className="flex-1 font-medium">{t("whatsapp.commands.label")}</h4>
          <Button asChild size="sm" variant="secondary">
            <Link href={managerUrl} rel="noopener" target="_blank">
              {t("actions.manage")}
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("whatsapp.commands.description")}
        </p>
        <div className="rounded-md border">
          <Table>
            <TableBody>
              {commands.map((command) => (
                <TableRow key={command.command_name}>
                  <TableCell>
                    <span className="font-medium">/{command.command_name}</span>{" "}
                    <span className="text-muted-foreground text-sm">
                      {command.command_description}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
