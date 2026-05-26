import {
  disabledContinueNodeTypes,
  type FlowNode,
  type NodeType,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { NodeToolbar, Position } from "@xyflow/react"
import { PlayCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { ArrowHandle } from "@/components/arrow-handle"
import { DynamicStepViewer } from "../steps"
import { ButtonStepViewer } from "../steps/button/viewer"
import { FlowNodeToolbar } from "../toolbar/node-toolbar"
import { allNodesConfig } from "./node-config"

type NodeViewerProps = {
  id: string
  type: NodeType
  data: FlowNode["data"] & { forceToolbarVisible?: boolean }
}

/**
 * Paleta minimalista — cor APENAS no ícone do header pra distinguir o tipo
 * do node. Borda e handles ficam neutros (padrão do tema). Pedro pediu
 * minimalista: "as cores está muito forte, está destacando muito, quero
 * algo minimalista".
 *
 * Comparar com BotConversa: ícone verde/amarelo/etc, mas border do card e
 * conectores são uniformes (cinza/azul).
 */
const NODE_ICON_COLORS: Partial<Record<NodeType, string>> = {
  [nodeTypeSchema.enum.sendMessage]: "text-emerald-500",
  [nodeTypeSchema.enum.performAction]: "text-amber-500",
  [nodeTypeSchema.enum.splitTraffic]: "text-blue-500",
  [nodeTypeSchema.enum.wait]: "text-violet-500",
  [nodeTypeSchema.enum.sendMail]: "text-cyan-500",
  [nodeTypeSchema.enum.startFlow]: "text-indigo-500",
  [nodeTypeSchema.enum.addNotes]: "text-zinc-500",
  [nodeTypeSchema.enum.landingPage]: "text-pink-500",
}

export const NodeViewer = memo((props: NodeViewerProps) => {
  const { id, type, data } = props
  const t = useTranslations()

  const nodeConfig = allNodesConfig[type]?.(t)
  const iconColor = NODE_ICON_COLORS[type] ?? "text-muted-foreground"
  const hasContinue = !disabledContinueNodeTypes.includes(type)

  const hasSteps =
    "steps" in data.details &&
    data.details.steps &&
    data.details.steps.length > 0
  const hasQuickReplies =
    "quickReplies" in data.details &&
    data.details.quickReplies &&
    data.details.quickReplies.length > 0
  const isEmpty = !(hasSteps || hasQuickReplies)

  return data.details && nodeConfig ? (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        {data.isStartNode && (
          <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
            <PlayCircleIcon className="text-sm" size={16} />
            {t("flowEditor.startBadge")}
          </div>
        )}
      </div>

      <NodeToolbar isVisible={data.forceToolbarVisible} offset={5}>
        <FlowNodeToolbar isStartNode={data.isStartNode} />
      </NodeToolbar>

      {/*
        TAMANHO PADRÃO: w-72 (288px) + min-h-[110px]. Garante que todos os
        nodes tenham mesma largura E altura mínima — mesmo quando não têm
        steps configurados (Pedro reclamou que ficavam "finos demais" comparado
        aos que têm conteúdo). Crescer só em altura quando adicionar steps.

        CORES: Card mais escuro que o canvas pra ter contraste claro
        (Pedro: "nodes e canvas com a mesma cor, não quero assim — só o
        fundo do canvas fica cinza, nodes ficam escuros igual sidebar").
         - Light mode: white sobre canvas zinc-100
         - Dark mode: zinc-950 sobre canvas zinc-900 (mais escuro que canvas)
      */}
      <Card className="flex min-h-[110px] w-72 flex-col gap-0 border-border bg-white p-0 dark:bg-zinc-950">
        <CardHeader className="border-border/50 border-b p-3">
          <CardTitle className="flex items-center gap-2 font-medium text-sm">
            {nodeConfig?.icon ? (
              <nodeConfig.icon className={cn("size-4 shrink-0", iconColor)} />
            ) : (
              " "
            )}
            <span className="truncate">{data.name}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 p-3">
          {hasSteps &&
            "steps" in data.details &&
            data.details.steps?.map((stepItem) => (
              <DynamicStepViewer
                data={stepItem}
                key={stepItem.id}
                nodeId={id}
                type={stepItem.stepType}
              />
            ))}

          {hasQuickReplies &&
            "quickReplies" in data.details &&
            data.details.quickReplies?.map((quickReplyItem) => (
              <ButtonStepViewer data={quickReplyItem} key={quickReplyItem.id} />
            ))}

          {/*
            Placeholder quando o node não tem conteúdo configurado — evita
            visual "vazio" e instrui o usuário a configurar. Estilo BotConversa
            (Bloco Inicial tem texto descritivo).
          */}
          {isEmpty && (
            <p className="text-muted-foreground text-xs">
              {t("actions.continue")} — clique para configurar
            </p>
          )}
        </CardContent>

        {/*
          Handles na borda externa do node, sem texto "Continuar". Cor
          uniforme (azul) pra todos — Pedro pediu minimalista.
        */}
        <ArrowHandle
          id={id}
          isConnectableStart={false}
          position={Position.Left}
          type="target"
        />
        {hasContinue && (
          <ArrowHandle id={id} position={Position.Right} type="source" />
        )}
      </Card>
    </>
  ) : (
    <div>Nó não encontrado</div>
  )
})
