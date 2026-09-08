import { withAuditContext } from "@chatbotx.io/business/audit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import { base } from "@/middlewares/context"

/**
 * Stamps the acting user onto every audit record a connect route writes.
 *
 * The workspace-scoped routes get this from `workspaceAuthorizedMidddleware`,
 * but a connect route cannot: its workspace comes from the pending-auth
 * cookie (or, for WhatsApp's first number, does not exist yet), so it
 * authorizes on the user alone. Without this the connect audits
 * (`auditChannelConnected`, the workspace-create audit) would be written with
 * no actor at all. `workspaceId` is deliberately absent — the core resolves
 * it, and the audit helpers pass their own.
 *
 * One middleware for all four routes rather than a `withAuditContext` call
 * copied into each handler: the derivation (session ip/user-agent, falling
 * back to the request headers) has to match `middlewares/auth.ts` exactly.
 */
export const connectAuditContextMiddleware = base.middleware(
  ({ context, next }) =>
    withAuditContext(
      {
        userId: context.user?.id,
        ipAddress:
          context.session?.ipAddress ?? getGuestClientIp(context.headers),
        userAgent:
          context.session?.userAgent ??
          context.headers.get("user-agent") ??
          undefined,
      },
      () => next({}),
    ),
)
