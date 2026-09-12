/**
 * Public API route path constants shared across layers that must agree on a
 * route's identity without importing each other (the route declaration in
 * `../api/public.ts` and the read-only-token allowlist in
 * `lib/workspace/authorize-workspace-access.ts`, which sits upstream of
 * `@/orpc` and cannot import the feature router without a cycle). Keep this
 * file free of imports so both sides can depend on it safely.
 */
export const ADS_CAMPAIGNS_INSIGHTS_PATH = "/v1/ads/campaigns/insights"
