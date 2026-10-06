import { importService } from "@chatbotx.io/business/import"
import type { ProductImportMeta } from "@chatbotx.io/database/partials"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"

/**
 * Validates the uploaded file, creates the import row and queues the worker
 * job. Shared by the builder action and the public API so both start an
 * import the same way, including the rollback when the queue is unavailable.
 */
export const startProductImportJob = async (input: {
  workspaceId: string
  userId: string | null
  fileId: string
  format: "csv" | "xlsx"
  meta: ProductImportMeta
}): Promise<{ importId: string }> => {
  const row = await importService.startProductImport(input)
  try {
    await defaultQueue.add(
      DefaultJobAction.runImport,
      {
        type: DefaultJobAction.runImport,
        data: { importId: row.id },
      },
      { jobId: `import-products-${row.id}` },
    )
  } catch (error) {
    await importService.fail(row.id, "Unable to queue product import")
    throw error
  }
  return { importId: row.id }
}
