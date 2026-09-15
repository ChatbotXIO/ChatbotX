import { waTemplateParamsSchema } from "@chatbotx.io/flow-config"
import { z } from "zod"

export const capabilitiesInboxSchema = z
  .object({
    id: z.string().describe("Inbox ID."),
    name: z.string().describe("Inbox name."),
    channel: z.string().describe("Inbox channel."),
  })
  .describe("An inbox available in the workspace.")
export type CapabilitiesInbox = z.infer<typeof capabilitiesInboxSchema>

export const capabilitiesTemplateSchema = z
  .object({
    id: z.string().describe("WhatsApp message template ID."),
    name: z.string().describe("WhatsApp message template name."),
    language: z.string().describe("WhatsApp message template language."),
    status: z
      .string()
      .describe(
        "WhatsApp message template status. Actual values are APPROVED, PENDING, or REJECTED.",
      ),
    params: waTemplateParamsSchema.describe(
      "Parameters required to send the WhatsApp message template.",
    ),
  })
  .describe("A WhatsApp message template available in the workspace.")
export type CapabilitiesTemplate = z.infer<typeof capabilitiesTemplateSchema>

export const capabilitiesFieldSchema = z
  .object({
    id: z.string().describe("Field ID."),
    name: z.string().describe("Field name."),
    type: z.string().describe("Field value type."),
  })
  .describe("A custom or bot field available in the workspace.")
export type CapabilitiesField = z.infer<typeof capabilitiesFieldSchema>

export const capabilitiesNamedEntitySchema = z
  .object({
    id: z.string().describe("Entity ID."),
    name: z.string().describe("Entity name."),
  })
  .describe("A named workspace entity.")
export type CapabilitiesNamedEntity = z.infer<
  typeof capabilitiesNamedEntitySchema
>

export const capabilitiesFlowSpecStepTypeSchema = z
  .object({
    type: z.string().describe("Flow-spec step type."),
    description: z.string().describe("How to use this flow-spec step type."),
  })
  .describe("A flow-spec step type supported by the flow authoring DSL.")
export type CapabilitiesFlowSpecStepType = z.infer<
  typeof capabilitiesFlowSpecStepTypeSchema
>

export const capabilitiesFlowSpecSchema = z
  .object({
    stepTypes: z
      .array(capabilitiesFlowSpecStepTypeSchema)
      .describe("Supported flow-spec step types."),
    waitUnits: z.array(z.string()).describe("Supported wait-step delay units."),
    channels: z.array(z.string()).describe("Supported flow channels."),
  })
  .describe("Reference data for authoring a flow spec.")
export type CapabilitiesFlowSpec = z.infer<typeof capabilitiesFlowSpecSchema>

export const capabilitiesResponseSchema = z
  .object({
    inboxes: z
      .array(capabilitiesInboxSchema)
      .optional()
      .describe("Inboxes available in the workspace."),
    templates: z
      .array(capabilitiesTemplateSchema)
      .optional()
      .describe("WhatsApp message templates available in the workspace."),
    customFields: z
      .array(capabilitiesFieldSchema)
      .optional()
      .describe("Custom fields available in the workspace."),
    botFields: z
      .array(capabilitiesFieldSchema)
      .optional()
      .describe("Bot fields available as reference data only."),
    tags: z
      .array(capabilitiesNamedEntitySchema)
      .optional()
      .describe("Tags available in the workspace."),
    aiAgents: z
      .array(capabilitiesNamedEntitySchema)
      .optional()
      .describe("AI agents available in the workspace."),
    sequences: z
      .array(capabilitiesNamedEntitySchema)
      .optional()
      .describe("Sequences available in the workspace."),
    flows: z
      .array(capabilitiesNamedEntitySchema)
      .optional()
      .describe("Flows available in the workspace."),
    flowSpec: capabilitiesFlowSpecSchema
      .optional()
      .describe("Reference data for authoring a flow spec."),
  })
  .describe("Workspace capabilities available to an agent.")
export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>
