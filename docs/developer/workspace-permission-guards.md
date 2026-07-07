# Workspace permission guards and contact PII scoping

This document is for developers adding or changing workspace member permission
checks in the builder app. Workspace permissions are security boundaries, so
server guards and data scoping must be kept in sync with any UI visibility
changes.

## Permission model

Workspace member permissions are stored in the `WorkspaceMember.permissions`
jsonb field and typed by `WorkspaceMemberPermissions` in
`packages/database/src/partials/workspace.ts`.

| Permission | Meaning |
| --- | --- |
| `superAdmin` | Full workspace access. Bypasses every permission gate. |
| `analytics` | Analytics and dashboard access. |
| `flows` | Flow builder access. |
| `contacts` | Full contacts section access. |
| `onlyAssignedContacts` | Contacts section access limited to contacts assigned to the current user. |
| `emailAndPhone` | Permission to view and export contact email and phone fields. |
| `broadcast` | Broadcast and sequence access. |
| `ecommerce` | Product and ecommerce access. |

Always use `hasWorkspacePermission()` from
`apps/builder/src/lib/auth/permission-routes.ts` instead of reading flags
directly. It grants every permission to `superAdmin` and fails closed when a
jsonb key is missing or `undefined`.

## Route and navigation guards

Server-side route guards are the source of truth. Sidebar filtering only hides
links and is not an authorization boundary.

Use these helpers from
`apps/builder/src/lib/auth/require-workspace-permission.ts`:

```ts
await resolveGuardedWorkspaceId(params, "broadcast")
await requireWorkspacePermission(workspaceId, "flows")
await requireContactsAccess(workspaceId)
```

- Use `resolveGuardedWorkspaceId(params, key)` in layouts and pages that receive
  `params: Promise<{ workspaceId: string }>` and need the resolved workspace id.
- Use `requireWorkspacePermission(workspaceId, key)` when the workspace id is
  already resolved.
- Use `requireContactsAccess(workspaceId)` for contacts pages. Contacts access is
  compound: `contacts || onlyAssignedContacts`.
- New guarded top-level sections should be added to `PERMISSION_NAV` in
  `apps/builder/src/lib/auth/permission-routes.ts` and to the sidebar filter in
  `apps/builder/src/components/app-sidebar.tsx`.
- Guard URL-equivalent route groups independently. For example, if both
  `products` and `(e-commerce)/products` can render product pages, both layouts
  need the ecommerce guard.

Existing examples:

- `apps/builder/src/app/space/[workspaceId]/dashboard/page.tsx` gates analytics
  with `requireWorkspacePermission(workspaceId, "analytics")`.
- `apps/builder/src/app/space/[workspaceId]/broadcasts/layout.tsx` gates
  broadcasts with `resolveGuardedWorkspaceId(params, "broadcast")`.
- `apps/builder/src/app/space/[workspaceId]/contacts/page.tsx` gates contacts
  with `requireContactsAccess(workspaceId)`.

## Contact data scoping

Contacts have two extra permission dimensions:

- `onlyAssignedContacts` restricts the member to contacts whose conversation is
  assigned to the current user.
- `emailAndPhone` controls whether contact email and phone fields can be read,
  searched, or exported.

Before returning or mutating contact data, resolve a contact permission scope
from `apps/builder/src/features/contacts/permissions.ts`:

```ts
const scope = await resolveContactPermissionScope(workspaceId)
const accessScope = await requireContactPermissionScope(workspaceId)
```

- Use `resolveContactPermissionScope()` when the caller can return a not-found or
  empty result for unauthorized access.
- Use `requireContactPermissionScope()` in mutations and authenticated APIs that
  should raise a domain error when the member cannot access contacts.
- Thread `scope.restrictToAssignedUserId` into database filters through
  `conversation.assignedUserId`.
- If `scope.canViewEmailAndPhone` is false, return `email: null` and
  `phoneNumber: null` using `maskContactEmailAndPhone()`.
- If `scope.canViewEmailAndPhone` is false, do not include `email` or
  `phoneNumber` keyword search clauses. A member without PII access should not be
  able to infer hidden values through search results.

Existing examples:

- `apps/builder/src/features/contacts/queries/list-contacts.queries.ts` applies
  assigned-contact scoping and removes PII keyword clauses.
- `apps/builder/src/features/contacts/queries/get-contact.query.ts` verifies the
  assigned user before returning a single contact and masks email and phone when
  needed.
- Contact server actions and authenticated contact APIs call
  `requireContactPermissionScope()` before mutating contact-owned data.

## Contact exports

CSV export crosses the builder-worker boundary, so the job payload must carry
the already-resolved permission scope explicitly.

- `apps/builder/src/features/contacts/actions/export-contacts.action.ts`
  resolves the contact permission scope before enqueueing the export job.
- `canExportEmailAndPhone` is required in
  `packages/worker-config/src/queues/default/index.ts`. Do not make it optional
  or default it to true.
- Pass `restrictToAssignedUserId` when the member has assigned-only contact
  access.
- Strip PII fields in the builder before enqueueing and again in the worker with
  `stripContactPIIFields()` from `@chatbotx.io/worker-config/contact-pii`.
- The worker's export filter in
  `apps/worker/src/default/handlers/export-contacts.ts` must mirror the builder
  contact list filter: workspace id, optional keyword and contact filter,
  assigned-user scope, and no email or phone keyword clauses when PII export is
  denied.

Treat an omitted or non-true `canExportEmailAndPhone` value as denied. This keeps
old or malformed jobs from failing open.

## Workspace-token APIs

Workspace-token APIs authenticate by workspace token, not by the current
workspace member. Do not assume member-scoped contact permissions apply there.
When adding a workspace-token surface that returns contacts or contact-derived
data, make the intended scope explicit in the API contract and tests.

## Change checklist

When adding or changing a guarded workspace feature:

1. Add the server-side route/page/layout guard.
2. Update `PERMISSION_NAV` and sidebar filtering if the feature appears in main
   navigation.
3. For contact data, resolve and thread `ContactPermissionScope` through every
   query, mutation, API, and worker job that can read or write contacts.
4. Mask or remove contact email and phone everywhere `emailAndPhone` is denied,
   including search filters and export fields.
5. Add or update tests for fail-closed behavior, `superAdmin` bypass,
   assigned-only scoping, and PII masking.

Useful tests:

- `apps/builder/__tests__/workspace-permission-routes.test.ts`
- `apps/builder/__tests__/require-workspace-permission.test.ts`
- `apps/builder/__tests__/contacts-route-guards.test.ts`
- `apps/builder/__tests__/contacts-permissions.test.ts`
- `apps/worker/__tests__/export-contacts-where.test.ts`
