# Platform support access

This document is for developers touching workspace membership, auth gates, or
the `/admin` console. Platform support access lets the platform super admin
(`isSuperAdmin(user)`, `packages/business/src/user/utils.ts` — matched by
`PLATFORM_ADMIN_EMAIL`, see `.env.example`) open a workspace — but **only**
once the workspace owner has opted in. There is no admin-initiated,
no-consent grant path.

## Model

Consent lives on the workspace itself: `Workspace.supportAccessUntil`
(`packages/database/src/schema/workspace.ts`). Any member with
`permissions.superAdmin` (the codebase's "owner-controlled" convention — the
owner always has it) can flip the "Allow platform support access" switch in
Settings → General. There is nothing else to configure — no duration picker.
Flipping it on sets `supportAccessUntil = now + 7 days`
(`SUPPORT_ACCESS_WINDOW_DAYS`,
`packages/business/src/workspace-support-access/service.ts`, `enable()`); the
window is fixed, not configurable. Flipping it off (`disable()`) simply clears
the flag — that alone ends every in-progress support session immediately,
because access is never backed by a stored row (see below).

`isSupportAccessEnabled(workspace)`
(`packages/business/src/workspace-member/predicates.ts`) is the read-time
check: true while `supportAccessUntil` is set and in the future.

## No membership row — access is synthesized at read time

Unlike a real member, a support session **never writes a `WorkspaceMember`
row**. There is no grant/revoke/expire step, and access is never gated by a
cron — `isSupportAccessEnabled` re-evaluates `supportAccessUntil > now()`
fresh on every request. A daily `clearExpiredSupportAccess` cron
(`apps/worker/src/schedule/handlers/clear-expired-support-access.ts`, wired
in `register-schedules.ts` like every other schedule job) does clear
`supportAccessUntil` back to `null` once the 7-day window passes, but this is
cleanup only — it exists so the column doesn't sit at a stale past timestamp
forever (which otherwise pollutes the `/admin` workspaces list's sort/display
of "who currently has support access"), not to enforce expiry. Instead,
`resolveWorkspaceAccess` (`packages/business/src/workspace-support-access/resolve-access.ts`)
is the single async entry point every auth gate calls to resolve a caller's
access to a workspace: it loads the workspace (from the real member's
attached row, or a direct fetch otherwise) and delegates the membership
decision to `resolveWorkspaceMembership`
(`packages/business/src/workspace-member/synthetic.ts`):

1. If a real `WorkspaceMember` row exists for `(workspaceId, userId)`, use it.
2. Otherwise, if the caller `isSuperAdmin(user)` and
   `isSupportAccessEnabled(workspace)`, synthesize a
   `WorkspaceMemberModel` in memory (`buildSupportMembership`) with
   `role: "agent"` and every `WorkspaceMemberPermissions` flag `true`
   (`FULL_WORKSPACE_MEMBER_PERMISSIONS`). **Full access only** — no read-only
   mode. A method-based read-only gate was ruled out because roughly a dozen
   session oRPC procedures are reads declared as POST (contacts list,
   conversations list, broadcast stats, most ads-campaign reads), so it would
   break pages. The safeguards are the time-box, owner consent, and the
   in-workspace banner — not a permissions restriction.
3. Otherwise, the caller has no access.

`resolveWorkspaceAccess` returns `{ workspace, member, isSupportSession }` (or
`undefined`) — `isSupportSession` is `true` whenever the member came from the
synthetic branch. This synthetic row is never inserted into the database —
treat it as call-scoped, in-memory data only.

Every gate that needs to resolve "does this user have access to this
workspace, and with what permissions" routes through `resolveWorkspaceAccess`
rather than querying `WorkspaceMember` directly:

- `apps/builder/src/middlewares/auth.ts` — `workspaceAuthorizedMidddleware`,
  the session gate for every oRPC session procedure.
- `apps/builder/src/lib/safe-action.ts` — `workspaceActionClientAllowExpired`,
  the base for every workspace-scoped server action (`workspaceActionClient`,
  `workspaceActionClientAllowScheduledDeletion` build on it). Exposes
  `ctx.isSupportSession` and `ctx.workspaceMemberPermissions` to every action
  built on it.
- `apps/builder/src/app/space/[workspaceId]/layout.tsx` — the RSC layout for
  the whole authenticated workspace shell.
- `apps/builder/src/lib/auth/utils.ts` — `getCurrentUserAndTargetWorkspace`,
  used by most workspace-scoped server actions and RSC pages that need the
  caller's membership for a specific `workspaceId`. Returns `isSupportSession`
  alongside `targetWorkspaceMember`.

**A support session cannot toggle its own access.** The synthetic membership
carries `permissions.superAdmin: true`, so a permission check alone would let
the platform super admin renew their own time-boxed window indefinitely
during an active session. `toggleSupportAccessAction`
(`apps/builder/src/features/workspaces/actions/toggle-support-access.action.ts`)
additionally rejects the call whenever `ctx.isSupportSession` is true — only a
real member (in practice, the owner or another real `superAdmin` member) can
enable or disable the switch.

One consequence of there being no row: a support session never shows up in
the user's *bulk* "all my workspaces" listings
(`workspaceMemberService.listByUserId`, `getCurrentUserAndAllLinkedWorkspaces`)
because those scan real `WorkspaceMember` rows only. The workspace layout
works around this for its own sidebar switcher by appending the
support-accessed workspace to the list it renders (see `allWorkspaces` in
`space/[workspaceId]/layout.tsx`) — any other bulk-listing UI that wants a
support session to appear needs the same treatment; this is not automatic.

## Quota: a support session is never billed

Because a support session never creates a `WorkspaceMember` row, it can never
be counted by anything that aggregates that table for billing or limits —
there is nothing to exclude. `WorkspaceUsage.teamMembers` and the private
`countDistinctTeamMembers` (`packages/business/src/user-quota/service.ts`,
exposed via `countDistinctTeamMembersForOwner`/`countDistinctTeamMembersForTenant`
and called from `apps/worker/src/schedule/handlers/sync-user-quota.ts`) count
real rows unconditionally.

## Audit trail

`WorkspaceSupportAccessService` dispatches an explicit audit record on every
state change, always passing `userId` and `workspaceId` directly rather than
relying on ambient audit context — `auditService.record` silently drops a
record missing either field (see `packages/business/src/audit/service.ts`).
Action names:

| Action | When |
| --- | --- |
| `support_access_enabled` | `enable()` — owner (or any `superAdmin` member) turns the Settings → General switch on |
| `support_access_disabled` | `disable()` — the switch is turned off |

There is no `support_access_granted`/`revoked`/`expired` event — there is no
grant step to audit. Enabling/disabling the window is the only state change
that happens; any individual access during that window is authorized fresh on
every request and isn't a separate auditable transition.

**Community edition persists no audit rows.** `apps/worker/src/default/handlers/send-audit-log.ts`
early-returns when `NEXT_PUBLIC_EDITION === "community"`, so the queued audit
job is a no-op there. `WorkspaceSupportAccessService` also calls
`logger.info` on every action independent of the audit dispatch, so community
installs still get a log-level trail even without a persisted `AuditLog` row.

## Known limitations (v1, accepted)

- Full access while a support session is active; no read-only mode (see
  "No membership row" above for why).
- No per-session audit trail — only the owner's enable/disable toggle is
  audited, not each individual request or navigation during the window.
- A support session does not appear in bulk "all my workspaces" listings
  unless that call site explicitly appends it (see above); the workspace
  layout does this for its own sidebar switcher, other listings do not.
- Community edition persists no audit rows for support-access events; the
  service logs instead (see "Audit trail" above).
