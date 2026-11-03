import { MAX_SEQUENCES_PER_TRIGGER_ACTION } from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import z from "zod"

/** The `sequenceIds` of the add/remove sequence trigger actions. */
export const sequenceIdsField = (description: string) =>
  z
    .array(zodBigintIdAsString())
    .min(1)
    .max(MAX_SEQUENCES_PER_TRIGGER_ACTION)
    .describe(description)
