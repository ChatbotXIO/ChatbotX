import type { ToolSet } from "ai"
import { aiPolicies, helpTexts, systemFunctionNames } from "../constants"

const KNOWLEDGE_BASE_TOOL = "search_knowledge_base"

export function appendToolOutputGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.toolOutputGuard}`.trim()
}

export function appendFabricationGuard(
  systemPrompt: string,
  tools: ToolSet,
): string {
  if (Object.keys(tools).length === 0) {
    return systemPrompt
  }
  return `${systemPrompt}\n\n${helpTexts.fabricationGuard}`.trim()
}

export function appendKnowledgeBaseGuard(
  systemPrompt: string,
  tools: ToolSet,
): string {
  if (!(KNOWLEDGE_BASE_TOOL in tools)) {
    return systemPrompt
  }
  return `${systemPrompt}\n\n${helpTexts.knowledgeBaseGuard}`.trim()
}

export function appendHandoffPolicy(
  systemPrompt: string,
  tools: ToolSet,
): string {
  if (!tools[systemFunctionNames.connectUserToHuman]) {
    return systemPrompt
  }
  return `${systemPrompt}\n\n${aiPolicies.handoff}`.trim()
}
