import type { PipelineStepAction } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"

/** Literal keys only: dynamic `t(\`...${x}\`)` keys are invisible to i18n:check. */
export function usePipelineActionLabel(): (
  action: PipelineStepAction,
) => string {
  const t = useTranslations()
  const labels: Record<PipelineStepAction, string> = {
    addToPipeline: t("flows.pipelineStep.actions.addToPipeline"),
    moveToStage: t("flows.pipelineStep.actions.moveToStage"),
    changeValue: t("flows.pipelineStep.actions.changeValue"),
    assign: t("flows.pipelineStep.actions.assign"),
    changeStatus: t("flows.pipelineStep.actions.changeStatus"),
    changePriority: t("flows.pipelineStep.actions.changePriority"),
    changeDueDate: t("flows.pipelineStep.actions.changeDueDate"),
    changeTitle: t("flows.pipelineStep.actions.changeTitle"),
    setCustomField: t("flows.pipelineStep.actions.setCustomField"),
    clearCustomField: t("flows.pipelineStep.actions.clearCustomField"),
    changeDescription: t("flows.pipelineStep.actions.changeDescription"),
    removeFromPipeline: t("flows.pipelineStep.actions.removeFromPipeline"),
    addComment: t("flows.pipelineStep.actions.addComment"),
    transfer: t("flows.pipelineStep.actions.transfer"),
  }
  return (action) => labels[action]
}
