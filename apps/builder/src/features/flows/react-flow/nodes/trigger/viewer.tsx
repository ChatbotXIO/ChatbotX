import type { FlowNode, TriggerNodeConfig } from "@chatbotx.io/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { NodeToolbar, Position } from "@xyflow/react"
import {
  MessageCircleIcon,
  MessageCircleOffIcon,
  PlayCircleIcon,
  RefreshCwIcon,
  TagIcon,
  TextCursorInputIcon,
  ZapIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { ArrowHandle } from "@/components/arrow-handle"
import { FlowNodeToolbar } from "../../toolbar/node-toolbar"

type TriggerViewerProps = {
  id: string
  data: FlowNode["data"] & { forceToolbarVisible?: boolean }
}

/**
 * Visual do TriggerNode no canvas — estilo Respond.io adaptado ao tema do
 * ChatbotX (cores `primary` do design system).
 *
 * Estrutura:
 *  - Badge "INÍCIO" no topo (sinaliza entry point)
 *  - Card destacado com border primary
 *  - Header: ⚡ ícone + título "Gatilho"
 *  - Body: ícone específico do subtipo + label do subtipo
 *  - Source handle no bottom (sem target — gatilho é entry point)
 *  - Toolbar restrito (FlowNodeToolbar esconde delete/duplicate quando
 *    isStartNode = true)
 */
export const TriggerNodeViewer = memo(({ id, data }: TriggerViewerProps) => {
  const t = useTranslations()
  const details = data.details as TriggerNodeConfig | undefined
  const subtypeInfo = details ? getSubtypeInfo(details.triggerType) : null
  const SubtypeIcon = subtypeInfo?.icon ?? ZapIcon

  return (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        <div className="inline-flex items-center gap-1 rounded-xl border border-primary/40 bg-primary px-2 py-0.5 text-primary-foreground text-xs">
          <PlayCircleIcon className="text-sm" size={14} />
          {t("flowEditor.startBadge")}
        </div>
      </div>

      <NodeToolbar isVisible={data.forceToolbarVisible} offset={5}>
        <FlowNodeToolbar isStartNode={data.isStartNode} />
      </NodeToolbar>

      {/*
        TAMANHO PADRÃO igual aos outros nodes (w-72 + min-h-[110px]). Ícone
        rosa só pra identificar tipo gatilho — border e handle uniformes
        com o resto (minimalista). Card mais escuro que o canvas pra
        contraste.
      */}
      <Card
        className={cn(
          "flex min-h-[110px] w-72 flex-col gap-0 overflow-hidden border-border bg-white p-0 dark:bg-zinc-950",
        )}
      >
        <CardHeader className="border-border/50 border-b p-3">
          <CardTitle className="flex items-center gap-2 font-medium text-sm">
            <ZapIcon className="size-4 text-primary" fill="currentColor" />
            {data.name || t("actions.trigger")}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 items-center gap-2 p-3">
          <SubtypeIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">
            {subtypeInfo
              ? t(subtypeInfo.labelKey)
              : t("trigger.flowNode.typePlaceholder")}
          </span>
        </CardContent>

        <ArrowHandle id={id} position={Position.Right} type="source" />
      </Card>
    </>
  )
})

TriggerNodeViewer.displayName = "TriggerNodeViewer"

// ─── Mapping subtipo → ícone + label key ────────────────────────────────────

type SubtypeInfo = {
  icon: React.ComponentType<{ className?: string }>
  labelKey: string
}

function getSubtypeInfo(
  triggerType: TriggerNodeConfig["triggerType"],
): SubtypeInfo {
  switch (triggerType) {
    case "conversationOpened":
      return {
        icon: MessageCircleIcon,
        labelKey: "trigger.flowNode.conversationOpened.label",
      }
    case "conversationClosed":
      return {
        icon: MessageCircleOffIcon,
        labelKey: "trigger.flowNode.conversationClosed.label",
      }
    case "contactFieldUpdated":
      return {
        icon: TextCursorInputIcon,
        labelKey: "trigger.flowNode.contactFieldUpdated.label",
      }
    case "contactTagUpdated":
      return {
        icon: TagIcon,
        labelKey: "trigger.flowNode.contactTagUpdated.label",
      }
    case "shortcut":
      return {
        icon: ZapIcon,
        labelKey: "trigger.flowNode.shortcut.label",
      }
    case "lifecycleStageChanged":
      return {
        icon: RefreshCwIcon,
        labelKey: "trigger.flowNode.lifecycleStageChanged.label",
      }
    default:
      return {
        icon: ZapIcon,
        labelKey: "trigger.flowNode.typePlaceholder",
      }
  }
}
