import type { TemplateUninstallEffect } from "@chatbotx.io/database/partials"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("template-uninstall-effects")

type EffectArgs = TemplateUninstallEffect["args"]
type EffectRunner = (args: EffectArgs) => Promise<void>

/**
 * Post-commit effects an uninstall delete records (cache invalidation, inbox
 * disconnect, events). Keyed by effect name; every runner MUST be idempotent:
 * a crash between commit and clearing the record runs it again.
 */
const runners = new Map<string, EffectRunner>()

/** Adapters register their runners once, at module load. */
export const registerUninstallEffect = (
  name: string,
  runner: EffectRunner,
): void => {
  runners.set(name, runner)
}

/**
 * Runs the effects in order. Returns true when every one completed, so the
 * caller may clear the record; a failure leaves it for the sweep. An unknown
 * name (a rolled-back deploy) is logged and counts as done, or the record
 * would be retried forever.
 */
export const runUninstallEffects = async (
  effects: readonly TemplateUninstallEffect[],
): Promise<boolean> => {
  for (const effect of effects) {
    const runner = runners.get(effect.name)
    if (!runner) {
      log.warn({ effect: effect.name }, "Unknown uninstall effect skipped")
      continue
    }
    try {
      await runner(effect.args)
    } catch (err) {
      log.error({ err, effect: effect.name }, "Uninstall effect failed")
      return false
    }
  }
  return true
}
