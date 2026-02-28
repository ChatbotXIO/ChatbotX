import { ClaudeConnect } from "@/features/integration-claude/claude-connect"
import { findIntegrationClaude } from "@/features/integration-claude/queries"

export default async function SettingIntegrationClaudePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    findIntegrationClaude({
      chatbotId: params.chatbotId,
    }),
  ])

  return <ClaudeConnect chatbotId={params.chatbotId} promises={promises} />
}
