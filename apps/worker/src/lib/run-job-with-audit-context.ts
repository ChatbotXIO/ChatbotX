import { SYSTEM_ACTOR, withAuditContext } from "@chatbotx.io/business/audit"

export function runJobWithAuditContext<T>(
  params: {
    workspaceId?: string
    requestedUserId?: string
    source: string
    ipAddress?: string
    userAgent?: string
  },
  fn: () => Promise<T>,
): Promise<T> {
  return withAuditContext(
    {
      userId: params.requestedUserId ?? SYSTEM_ACTOR,
      workspaceId: params.workspaceId,
      source: params.source,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
    fn,
  )
}
