/**
 * Estimated time to completion shown to the operator while a scan is
 * `init`/`running`, derived (never persisted) as `latest.createdAt + this`.
 * Mirrors `CONTACT_SCAN_ETA_MS` in
 * `packages/business/src/contact-scan/constants.ts` — duplicated here
 * (rather than imported) because this value is read by a client component
 * (`components/contact-scan-form.tsx`) and `@chatbotx.io/business` pulls
 * in server-only dependencies that must never reach the client bundle.
 */
export const CONTACT_SCAN_ETA_MS = 4 * 60 * 60 * 1000

/**
 * Date-time format used across the scan form and its status panel. Rendered
 * through `useFormatter().dateTime`, so the viewer's locale/timezone applies.
 */
export const DATE_TIME_FORMAT_OPTIONS = {
  dateStyle: "medium",
  timeStyle: "short",
} as const
