import { createId } from "@chatbotx.io/utils"
import type { ImportHandler } from "../../types"
import { replaceTemplate } from "../../utils"

export const handler: ImportHandler<"products"> = {
  buildPath: (input, entry) => {
    const extension = input.fileName.split(".").pop() || "xlsx"
    const fileName = `import_${createId()}.${extension}`

    return replaceTemplate(entry.config.paths.storageUrl, {
      workspaceId: input.workspaceId,
      fileName,
    })
  },
}

export * from "./header-match"
export * from "./template"
