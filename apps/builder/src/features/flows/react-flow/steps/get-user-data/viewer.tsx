"use client"

import {
  type GetUserDataStepSchema,
  stateTypes,
} from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { BaseStateViewer } from "../../states/viewer"

const GetUserDataStepViewer = ({ data }: { data: GetUserDataStepSchema }) => {
  const getStateLabel = (stateType: string) =>
    stateType === stateTypes.skip ? data.skipButtonLabel : undefined

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.message}
        </p>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer
              data={state}
              key={state.id}
              label={getStateLabel(state.stateType)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default GetUserDataStepViewer
