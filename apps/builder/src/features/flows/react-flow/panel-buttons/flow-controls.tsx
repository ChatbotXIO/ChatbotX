"use client"

import type { NodeType } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useReactFlow } from "@xyflow/react"
import { Add, Maximize, SearchZoomIn, SearchZoomOut } from "iconsax-reactjs"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"
import { allNodesConfig } from "../nodes/node-config"
import { addNewNode } from "./add-node-button"

// Ícones Iconsax (mesma família visual do resto do app)
const PlusIcon = wrapIconsax(Add as IconsaxComponent, "Bold")
const ZoomInIcon = wrapIconsax(SearchZoomIn as IconsaxComponent)
const ZoomOutIcon = wrapIconsax(SearchZoomOut as IconsaxComponent)
const MaximizeIcon = wrapIconsax(Maximize as IconsaxComponent)

/**
 * Card de controles flutuante no canto superior esquerdo do canvas — estilo
 * premium (Respond.io / Figma). Substitui os botões padrão do react-flow
 * que tinham aparência desatualizada.
 *
 * Layout:
 *  - Botão primário "+" Adicionar node (cor primary, destacado)
 *  - Separador visual
 *  - Botões secundários: Zoom In, Zoom Out, Focus (cor neutra)
 *
 * Todos com tooltip e ícones consistentes. Tamanho fixo 36×36.
 */
export function FlowControls() {
  const t = useTranslations()
  const reactFlow = useReactFlow()
  const [addOpen, setAddOpen] = useState(false)

  const onAdd = (nodeType: NodeType) => {
    addNewNode(reactFlow, nodeType, t)
    setAddOpen(false)
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/60",
      )}
    >
      <Popover onOpenChange={setAddOpen} open={addOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={t("flowEditor.addNode")}
                className="size-9 rounded-lg shadow-sm transition-all hover:shadow-md"
                size="icon"
              >
                <PlusIcon className="size-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">
            {t("flowEditor.addNode")}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-52 p-1" side="right">
          <div className="flex flex-col">
            {Object.values(allNodesConfig).map((it, idx) => {
              const item = it?.(t)
              if (!item) {
                // biome-ignore lint/suspicious/noArrayIndexKey: empty placeholder
                return <div key={idx} />
              }
              // TriggerNode não é adicionável pelo botão "+" — ele já vem por
              // default e é único por flow. Esconder da lista.
              if (item.type === "trigger") {
                return null
              }
              return (
                <Button
                  className="h-9 w-full justify-start gap-2 px-2"
                  key={item.type}
                  onClick={() => onAdd(item.type)}
                  variant="ghost"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="text-sm">{item.label}</span>
                </Button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Separador visual entre ação primária e secundárias */}
      <div className="my-0.5 h-px w-full bg-border/60" />

      <ControlIconButton
        Icon={ZoomInIcon}
        label={t("flowEditor.zoomIn")}
        onClick={() => reactFlow.zoomIn()}
      />
      <ControlIconButton
        Icon={ZoomOutIcon}
        label={t("flowEditor.zoomOut")}
        onClick={() => reactFlow.zoomOut()}
      />
      <ControlIconButton
        Icon={MaximizeIcon}
        label={t("flowEditor.fitView")}
        onClick={() => reactFlow.fitView({ padding: 0.2, duration: 300 })}
      />
    </div>
  )
}

const ControlIconButton = ({
  Icon,
  label,
  onClick,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={label}
        className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onClick}
        size="icon"
        variant="ghost"
      >
        <Icon className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>
)
