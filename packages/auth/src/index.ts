export type { Auth, AuthConfig } from "./server"
export { createAuth } from "./server"
export {
  getTenantId,
  resolveTenantByDomain,
  withTenant,
} from "./tenant-context"
