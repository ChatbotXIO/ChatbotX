import type { ContactSyncProvider } from "@chatbotx.io/database/partials"
import type { ContactSyncAdapter } from "../types"
import { ahachatContactSyncAdapter } from "./ahachat"

/** One adapter per provider; a missing one is a compile error. */
export const contactSyncAdapters = {
  ahachat: ahachatContactSyncAdapter,
} satisfies Record<ContactSyncProvider, ContactSyncAdapter>
