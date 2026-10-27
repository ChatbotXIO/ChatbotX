import type { PipelineItemModel } from "@chatbotx.io/database/types"

/** An open item whose due date has passed. */
export const isItemOverdue = (
  item: Pick<PipelineItemModel, "status" | "dueDate">,
  now: number = Date.now(),
): boolean =>
  item.status === "open" &&
  item.dueDate !== null &&
  item.dueDate.getTime() < now
