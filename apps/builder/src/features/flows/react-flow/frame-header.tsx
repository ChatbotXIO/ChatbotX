"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { Edit2 } from "iconsax-reactjs"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"
import { PageHeader } from "@/components/page-header"
import type { FlowResource } from "../schemas/resource"
import { RenameFlowDialog } from "./components/rename-flow"
import { FlowEditToolbar } from "./flow-edit-toolbar"

const PencilIcon = wrapIconsax(Edit2 as IconsaxComponent)

/**
 * Header do flow editor — usa o componente `PageHeader` padronizado
 * (altura `h-[52px]`, mesmo padrão do Respond.io).
 *
 * Layout:
 *  [< voltar] [nome do flow] [✏️ pencil]              [toolbar Publicar/...]
 */
export function FrameHeader({ flow }: { flow: FlowResource }) {
  const t = useTranslations()
  const [renameOpen, setRenameOpen] = useState(false)

  return (
    <>
      <PageHeader
        actions={<FlowEditToolbar flow={flow} workspaceId={flow.workspaceId} />}
        backHref={`/space/${flow.workspaceId}/flows`}
        backLabel={t("actions.back")}
        title={flow.name}
        titleAdornment={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("actions.rename")}
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setRenameOpen(true)}
                size="icon"
                variant="ghost"
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("actions.rename")}</TooltipContent>
          </Tooltip>
        }
      />

      <RenameFlowDialog
        flow={flow}
        onOpenChange={setRenameOpen}
        open={renameOpen}
      />
    </>
  )
}
