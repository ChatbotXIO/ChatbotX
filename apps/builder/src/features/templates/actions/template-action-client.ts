import {
  assertCanManageTemplates,
  type TemplateActor,
} from "@chatbotx.io/business"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"

type MemberPermissions = Extract<
  TemplateActor,
  { kind: "member" }
>["permissions"]

const manageActor = (permissions: MemberPermissions): TemplateActor => {
  const templateActor: TemplateActor = { kind: "member", permissions }
  assertCanManageTemplates(templateActor)
  return templateActor
}

/**
 * Shared gate for every template mutation action — applies the business-layer
 * manage rule once and hands the derived `templateActor` to the handler, so a
 * new action can't forget either. `workspaceActionClient` alone only verifies
 * membership; page-level guards are bypassable by calling an action directly
 * (see `update-webchat.action.ts`'s comment for the same precedent), so the
 * check has to live in the action layer too. Category checks that depend on
 * the template's contents run in `templateService`.
 */
export const templateActionClient = workspaceActionClient.use(({ ctx, next }) =>
  next({
    ctx: { templateActor: manageActor(ctx.workspaceMemberPermissions) },
  }),
)

/**
 * The same gate for delete-type and read-type actions, which a trial-expired
 * workspace keeps (AGENTS.md invariant 14).
 */
export const templateActionClientAllowExpired =
  workspaceActionClientAllowExpired.use(({ ctx, next }) =>
    next({
      ctx: { templateActor: manageActor(ctx.workspaceMemberPermissions) },
    }),
  )
