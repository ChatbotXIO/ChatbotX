import { stepTypes, whatsappFlowDefaultButton } from "@chatbotx.io/flow-config"
import { WorkflowIcon } from "lucide-react"
import type { ListInboxesResponse } from "@/features/inboxes/schema/action"
import type { WhatsappFlowResource } from "@/features/integration-whatsapp/flows/schema/resource"
import type { MenuData, MenuItem, TranslationFn } from "../../types"

const WHATSAPP_FLOW_PUBLISHED_STATUS = "PUBLISHED"

export const waFlowMenus = (
  t: TranslationFn,
  menuData?: MenuData,
  inbox?: ListInboxesResponse["data"][number],
): MenuItem[] => {
  let flows = (menuData?.flows.waFlows ?? []).filter(
    (flow: WhatsappFlowResource) =>
      flow.status === WHATSAPP_FLOW_PUBLISHED_STATUS,
  )

  if (inbox) {
    flows = flows.filter(
      (flow: WhatsappFlowResource) =>
        flow.integrationWhatsapp?.inboxId === inbox.id,
    )
  }

  if (flows.length === 0) {
    return [
      {
        label: t("flows.actions.noFlowsAvailable"),
        icon: WorkflowIcon,
        stepType: null,
      },
    ]
  }

  return flows.map((flow: WhatsappFlowResource) => ({
    label: flow.name,
    icon: WorkflowIcon,
    stepType: stepTypes.enum.whatsappFlow,
    props: {
      inboxId: flow.integrationWhatsapp?.inboxId,
      buttons: [whatsappFlowDefaultButton(flow.name)],
      flow: {
        id: flow.id,
        sourceId: flow.sourceId,
        startScreenId: null,
        fieldMappings: [],
      },
    },
  }))
}
