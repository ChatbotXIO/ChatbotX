import { assertInstallOrderMatches } from "./install-order"
import { TEMPLATE_INSTALL_ORDER } from "./registry"

// Run once at module load: a forgotten `deferredKinds` entry, or an adapter
// moved without updating the hand-written `TEMPLATE_INSTALL_ORDER`, fails
// loudly here instead of silently writing a dangling reference at install
// time.
assertInstallOrderMatches(TEMPLATE_INSTALL_ORDER)

export * from "./install-order"
export * from "./registry"
export * from "./types"
