import type {
  ButtonStepProps,
  WhatsappFlowStepSchema,
} from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { replaceCouponVariableTokensWithLabels } from "@/components/tiptap/extensions/variable-injection/mention"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { useWhatsappFlow } from "../../stores/whatsapp-flow-store-provider"
import { ButtonGroupViewer } from "../button/viewer"

type WhatsappFlowStepViewerProps = {
  data: WhatsappFlowStepSchema
}

const WhatsappFlowStepViewer = (props: WhatsappFlowStepViewerProps) => {
  const { data } = props
  const t = useTranslations()
  const whatsappFlows = useWhatsappFlow((s) => s.whatsappFlows)
  const { labelById } = useCouponTopicOptions()
  const buttons = useMemo(() => {
    if (Array.isArray(data.buttons)) {
      return data.buttons
    }

    const legacyData = data as unknown as {
      buttonId?: string
      buttonLabel?: string
    }

    if (!(legacyData.buttonId && legacyData.buttonLabel)) {
      return []
    }

    return [
      {
        id: legacyData.buttonId,
        label: legacyData.buttonLabel,
        buttonType: null,
        beforeStep: null,
        steps: [],
      },
    ] satisfies ButtonStepProps[]
  }, [data])
  const flowName = useMemo(
    () =>
      whatsappFlows.find((flow) => flow.id === data.flow.id)?.name ??
      t("flows.whatsappFlow.selectFlow"),
    [whatsappFlows, data.flow.id, t],
  )
  const previewText = useMemo(
    () => replaceCouponVariableTokensWithLabels(data.text, labelById),
    [data.text, labelById],
  )

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          <div className="mb-1 flex items-center gap-2">
            <WorkflowIcon className="text-muted-foreground" size={16} />
            <span className="font-medium text-muted-foreground text-sm">
              {flowName}
            </span>
          </div>
          <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
            {previewText}
          </p>
        </div>
        <ButtonGroupViewer data={buttons} />
      </CardContent>
    </Card>
  )
}

export default WhatsappFlowStepViewer
