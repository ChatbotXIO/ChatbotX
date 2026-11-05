import { type TemplateDetail, templateService } from "./service"
import { withoutDeletedResources } from "./snapshot-collect"

/** The template as the editor opens it: nothing selected that no longer exists. */
export const getEditableTemplateOrFail = async (input: {
  workspaceId: string
  templateId: string
}): Promise<TemplateDetail> => {
  const template = await templateService.getDetailOrFail(input)
  return {
    ...template,
    selection: await withoutDeletedResources(
      input.workspaceId,
      template.selection,
    ),
  }
}
