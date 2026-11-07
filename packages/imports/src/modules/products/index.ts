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
// `./template` (exceljs) is deliberately NOT re-exported: client components
// import this module through the package root and `./registry`, and exceljs
// is CommonJS with no `sideEffects` flag, so a re-export ships ~920 KB of it to
// the browser. Server code imports `@chatbotx.io/imports/modules/products/template`.
