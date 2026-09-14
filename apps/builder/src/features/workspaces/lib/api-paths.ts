/**
 * Public API route path constants shared across layers that must agree on a
 * route's identity without importing each other (the route declarations in
 * `../api/public.ts` and the deletion-lifecycle exemptions in
 * `lib/workspace/authorize-workspace-access.ts` and
 * `middlewares/workspace-token-auth.ts`, which sit upstream of `@/orpc` and
 * cannot import the feature router without a cycle). Keep this file free of
 * imports so all sides can depend on it safely.
 */
export const WORKSPACE_DELETION_PATH = "/v1/workspace/deletion"
