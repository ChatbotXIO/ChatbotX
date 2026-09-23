import {
  customFieldService,
  flowService,
  inboxTeamService,
  tagService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AIAgentsTable } from "@/features/ai-agents/ai-agent-table"
import { listAIAgents } from "@/features/ai-agents/queries"
import { listAIAgentsRequest } from "@/features/ai-agents/schema/query"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"

type AIAgentsPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export default async function AIAgentsPage(props: AIAgentsPageProps) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams

  const aiAgentPromises = Promise.all([
    listAIAgents({
      workspaceId,
      ...listAIAgentsRequest.parse(searchParams),
    }),
    listIntegrationOpenaiCompatible({ workspaceId }),
    workspaceService.findById({ id: workspaceId }),
    Promise.all([
      flowService.list({ workspaceId, page: 1, perPage: 100 }),
      tagService.list({ workspaceId, page: 1, perPage: 100 }),
      customFieldService.list({ workspaceId, page: 1, perPage: 100 }),
      workspaceMemberService.listByWorkspaceId({ workspaceId }),
      inboxTeamService.listByWorkspace({ workspaceId }),
    ]).then(([flows, tags, customFields, members, inboxTeams]) => ({
      flows: flows.data.map((flow) => ({ label: flow.name, value: flow.id })),
      tags: tags.data.map((tag) => ({ label: tag.name, value: tag.id })),
      customFields: customFields.data.map((field) => ({
        label: field.name,
        type: field.type,
        value: field.id,
      })),
      admins: members.filter(isWorkspaceAdminMember).map((member) => ({
        label: member.user.name ?? member.user.email,
        value: member.userId,
      })),
      inboxTeams: inboxTeams.map((team) => ({
        label: team.name,
        value: team.id,
      })),
    })),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <AIAgentsTable promises={aiAgentPromises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
