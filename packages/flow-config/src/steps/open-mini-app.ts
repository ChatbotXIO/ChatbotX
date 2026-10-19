import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

/**
 * A button that opens a Mini App. The worker turns it into a link to the
 * Mini App's public page when sending; once the contact submits, the flow
 * continues along the button's edge (if any) — the same way a
 * `sendMessage` button does after a click.
 */
export const openMiniAppStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.openMiniApp)
    .describe('Step type discriminator: "openMiniApp".'),
  miniAppId: zodBigintAsString().describe(
    "Id of the Mini App the button opens. Get Mini App ids from `miniApps.list`.",
  ),
})

export type OpenMiniAppStepSchema = z.infer<typeof openMiniAppStepSchema>

export const openMiniAppStepDefaultFn = (
  props?: Partial<OpenMiniAppStepSchema>,
): OpenMiniAppStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.openMiniApp,
  miniAppId: "",
  ...props,
})
