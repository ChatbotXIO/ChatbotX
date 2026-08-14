"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useEffect } from "react"
import { toast } from "sonner"
import type { IntegrationWhatsappLinkable } from "@/features/integration-whatsapp/queries"
import type { findWhatsappAutomation } from "./queries"

type WhatsappAutomationResponse = Awaited<
  ReturnType<typeof findWhatsappAutomation>
> & { error?: string }

type WhatsappAutomationManageProps = {
  integrationWhatsapp: IntegrationWhatsappLinkable
  promises: Promise<[WhatsappAutomationResponse]>
}

export function WhatsappAutomationManage({
  integrationWhatsapp,
  promises,
}: WhatsappAutomationManageProps) {
  const t = useTranslations()
  const [{ prompts, commands, error }] = use(promises)

  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const managerUrl = `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${integrationWhatsapp.businessId}&asset_id=${integrationWhatsapp.wabaId}`

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex">
          <h4 className="flex-1 font-medium">
            {t("whatsapp.icebreakers.label")}
          </h4>
          <Link
            className={buttonVariants({ size: "sm", variant: "secondary" })}
            href={managerUrl}
            rel="noopener"
            target="_blank"
          >
            {t("actions.manage")}
          </Link>
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
          <Link
            className={buttonVariants({ size: "sm", variant: "secondary" })}
            href={managerUrl}
            rel="noopener"
            target="_blank"
          >
            {t("actions.manage")}
          </Link>
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
