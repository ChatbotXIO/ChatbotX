import type { PipelineActivityGroup } from "@chatbotx.io/database/partials"

/** Message key (in `pipelines`) of each activity group's label. */
export const ACTIVITY_GROUP_LABEL_KEYS = {
  lifecycle: "item.activityGroup.lifecycle",
  stage: "item.activityGroup.stage",
  status: "item.activityGroup.status",
  value: "item.activityGroup.value",
  priority: "item.activityGroup.priority",
  dueDate: "item.activityGroup.dueDate",
  details: "item.activityGroup.details",
  assignees: "item.activityGroup.assignees",
  comments: "item.activityGroup.comments",
  attachments: "item.activityGroup.attachments",
} as const satisfies Record<PipelineActivityGroup, string>
