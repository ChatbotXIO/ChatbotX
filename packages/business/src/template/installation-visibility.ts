import type { TemplateCategory } from "@chatbotx.io/database/partials"
import {
  templateInstallationSyncRepository,
  templateRepository,
} from "@chatbotx.io/database/repositories"
import { notFoundException } from "../errors"
import { type TemplateActor, visibleInstallCategories } from "./permissions"

/**
 * The categories an installation is about: those of its copies, or, while it
 * has none (pending, or failed early), those of its source template. `null`
 * when neither is known (the template is gone).
 */
const installationCategories = async (installation: {
  id: string
  sourceTemplateId: string | null
}): Promise<TemplateCategory[] | null> => {
  const copies =
    await templateInstallationSyncRepository.listInstalledResources(
      installation.id,
    )
  if (copies.length > 0) {
    return copies.map((copy) => copy.category)
  }
  if (!installation.sourceTemplateId) {
    return null
  }
  const counts = await templateRepository.findCategoryCounts(
    installation.sourceTemplateId,
  )
  if (!counts) {
    return null
  }
  return (Object.entries(counts) as [TemplateCategory, number | undefined][])
    .filter(([, total]) => (total ?? 0) > 0)
    .map(([category]) => category)
}

/**
 * A member sees an installation only when they hold every category it is
 * about; otherwise it answers not found, the same rule the installations list
 * applies in SQL. API tokens act as the owner and see everything.
 */
export const assertCanViewInstallation = async (
  installation: { id: string; sourceTemplateId: string | null },
  actor: TemplateActor,
): Promise<void> => {
  const visible = visibleInstallCategories(actor)
  if (!visible) {
    return
  }
  const categories = await installationCategories(installation)
  if (
    categories === null ||
    categories.some((category) => !visible.includes(category))
  ) {
    throw notFoundException("Template installation not found")
  }
}
