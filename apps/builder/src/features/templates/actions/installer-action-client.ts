import {
  canViewTemplateInstalls,
  type TemplateActor,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"

type MemberPermissions = Extract<
  TemplateActor,
  { kind: "member" }
>["permissions"]

/**
 * The one refusal for "this member can not act on template installs". Every
 * installer-side action goes through it, so the message and code never diverge.
 */
export const assertCanViewInstalls = (permissions: MemberPermissions): void => {
  if (!canViewTemplateInstalls(permissions)) {
    throw new ChatbotXException(
      "You don't have permission to use template installs",
      "templateCategoryPermissionDenied",
      403,
    )
  }
}

const installerActor = (permissions: MemberPermissions): TemplateActor => {
  assertCanViewInstalls(permissions)
  return { kind: "member", permissions }
}

/**
 * Installer-side actions that change what an install holds (retry, sync,
 * restore, install settings). Installing needs only the contents' permissions,
 * so the gate is the right to see installs, not `flows`; the services re-check
 * every category. A trial-expired workspace is read/delete-only, so these use
 * the normal client.
 */
export const installerActionClient = workspaceActionClient.use(
  ({ ctx, next }) =>
    next({
      ctx: { templateActor: installerActor(ctx.workspaceMemberPermissions) },
    }),
)

/**
 * Installer-side read/delete-type actions (uninstall preview, uninstall,
 * cancel uninstall): they stay available on a trial-expired workspace
 * (AGENTS.md invariant 14).
 */
export const installerActionClientAllowExpired =
  workspaceActionClientAllowExpired.use(({ ctx, next }) =>
    next({
      ctx: { templateActor: installerActor(ctx.workspaceMemberPermissions) },
    }),
  )
