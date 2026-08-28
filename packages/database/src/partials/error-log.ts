/**
 * `errorLogProviders` is defined in `@chatbotx.io/utils/error-log` so packages
 * that cannot depend on the database layer can still use it. Re-exported here
 * because `@chatbotx.io/worker-config` depends on `@chatbotx.io/database` but
 * not on `@chatbotx.io/utils`, and needs the type for its job payload. Both
 * paths resolve to the same enum — this mirrors `./channel`.
 */
export {
  type ErrorLogProvider,
  errorLogProviders,
} from "@chatbotx.io/utils/error-log"
