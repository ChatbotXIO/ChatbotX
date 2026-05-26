import { z } from "zod"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

/**
 * TriggerNode — primeiro node de TODO flow novo. Replica o comportamento
 * do Respond.io onde o "trigger" é o entry point do workflow (não uma entity
 * separada em Settings).
 *
 * - Não deletável
 * - Não duplicável
 * - Sempre `isStartNode: true`
 * - Único trigger por flow (exatamente 1)
 *
 * 6 subtipos suportados (config via discriminated union no `details`).
 * Cada subtipo tem params opcionais que servem como FILTROS — sem params =
 * "qualquer evento daquele tipo dispara o flow".
 */

// ─── Subtipo 1: Conversation Opened ─────────────────────────────────────────
const conversationOpenedConfig = z.object({
  triggerType: z.literal("conversationOpened"),
  /**
   * Filtra por origem da abertura. Vazio = qualquer origem.
   * Valores possíveis: "user", "workflow", "contact", "api", "zapier", "make",
   * "clickToChatAd"
   */
  sources: z.array(z.string()).optional(),
})

// ─── Subtipo 2: Conversation Closed ─────────────────────────────────────────
const conversationClosedConfig = z.object({
  triggerType: z.literal("conversationClosed"),
  /** Filtra por categoria de nota de fechamento. Vazio = qualquer. */
  closingCategoryIds: z.array(z.string()).optional(),
  /** Filtra por origem do fechamento (user/workflow/bot/api). Vazio = qualquer. */
  closedBy: z.array(z.string()).optional(),
})

// ─── Subtipo 3: Contact Field Updated ───────────────────────────────────────
const contactFieldUpdatedConfig = z.object({
  triggerType: z.literal("contactFieldUpdated"),
  /** Filtra por IDs de custom fields. Vazio = qualquer campo. */
  fieldIds: z.array(z.string()).optional(),
})

// ─── Subtipo 4: Contact Tag Updated ─────────────────────────────────────────
const contactTagUpdatedConfig = z.object({
  triggerType: z.literal("contactTagUpdated"),
  /** Ação que dispara: tag adicionada, removida, ou qualquer mudança. */
  action: z.enum(["added", "removed", "any"]).default("any"),
  /** Filtra por IDs de tags específicas. Vazio = qualquer tag. */
  tagIds: z.array(z.string()).optional(),
})

// ─── Subtipo 5: Shortcut ────────────────────────────────────────────────────
const shortcutConfig = z.object({
  triggerType: z.literal("shortcut"),
  /** Ícone (emoji) que aparece no atalho dentro do Inbox. */
  icon: z.string().optional(),
  /** Label exibido no botão de atalho. */
  label: z.string().optional(),
})

// ─── Subtipo 6: Lifecycle Stage Changed ─────────────────────────────────────
const lifecycleStageChangedConfig = z.object({
  triggerType: z.literal("lifecycleStageChanged"),
  /** Filtra por etapas de destino. Vazio = qualquer destino. */
  toStageIds: z.array(z.string()).optional(),
  /** Filtra por etapas de origem. Vazio = qualquer origem. */
  fromStageIds: z.array(z.string()).optional(),
  /** Se true, dispara também quando lifecycle é REMOVIDO (cleared). */
  triggerOnCleared: z.boolean().default(false),
})

// ─── Union discriminada ─────────────────────────────────────────────────────
export const triggerNodeConfigSchema = z.discriminatedUnion("triggerType", [
  conversationOpenedConfig,
  conversationClosedConfig,
  contactFieldUpdatedConfig,
  contactTagUpdatedConfig,
  shortcutConfig,
  lifecycleStageChangedConfig,
])
export type TriggerNodeConfig = z.infer<typeof triggerNodeConfigSchema>

// ─── Node Schema ────────────────────────────────────────────────────────────
export const triggerNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.trigger),
  data: baseNodeDataSchema.extend({
    /**
     * Forçado true. TriggerNode é SEMPRE o startNode do flow.
     * Validado em runtime no editor + na publicação.
     */
    isStartNode: z.literal(true),
    details: triggerNodeConfigSchema,
  }),
})
export type TriggerNodeSchema = z.infer<typeof triggerNodeSchema>

// ─── Default Factory ────────────────────────────────────────────────────────
export const triggerNodeDefaultFn = (
  props?: DefaultNodeProps,
): TriggerNodeSchema => {
  // Spread `dataProps` mas força isStartNode=true (literal) — TriggerNode é
  // SEMPRE o startNode. dataProps pode trazer name custom.
  const dataProps = props?.dataProps ?? {}
  return {
    ...defaultNodeData(),
    type: nodeTypeSchema.enum.trigger,
    ...props?.nodeProps,
    data: {
      name: "Gatilho",
      ...dataProps,
      isStartNode: true,
      details: {
        triggerType: "conversationOpened",
      },
    },
  }
}
