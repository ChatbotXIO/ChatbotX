"use client"

import { SelectField } from "@/components/form/select-field"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimePicker } from "@/components/ui/date-picker"
import { Form } from "@/components/ui/form"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/create-broadcast-schema"
import {
  type BroadcastSchedulesType,
  BroadcastSubaction,
  InboxType,
} from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { add } from "date-fns"
import { AtomIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { use, useState } from "react"
import { toast } from "sonner"
import { FlowSelect } from "../flows/flow-select"
import type { listInboxes } from "../inboxes/queries"

export function CreateBroadcastForm({
  chatbotId,
  promises,
}: {
  chatbotId: string
  promises: Promise<Awaited<ReturnType<typeof listInboxes>>>
}) {
  const { t } = useTranslate()

  const [hasInboxType, setHasInboxType] = useState(false)
  const [hasSubAction, setHasSubAction] = useState(false)
  const [schedulesType, _setSchedulesType] =
    useState<BroadcastSchedulesType | null>(null)

  const { data } = use(promises)
  const inboxTypes = data.map((inbox) => inbox.inboxType)
  const schedulesOptions = [
    {
      value: "NOW",
      label: "Now",
    },
    {
      value: "FUTURE",
      label: "Schedule for later (All simultaneously)",
    },
  ]

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Broadcast created successfully")
          resetFormAndAction()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          inboxType: null,
          conditions: [],
        },
      },
      errorMapProps: {},
    },
  )

  const onSelectInboxType = (inboxType: InboxType | null) => {
    setHasInboxType(true)
    setValue("inboxType", inboxType)

    if (inboxType === null) {
      setHasSubAction(true)
      setValue("subaction", BroadcastSubaction.ALL_CONTACTS)
    }
  }

  return (
    <div className="flex justify-center">
      <Card key={t.name} className="w-5/6">
        <CardContent className="py-4">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              {!hasInboxType && (
                <InboxTypeSelect
                  inboxTypes={inboxTypes}
                  onSelectInboxType={onSelectInboxType}
                />
              )}

              {hasInboxType && hasSubAction && (
                <>
                  <FlowSelect
                    label="Flow to send"
                    name="flowId"
                    isRequired={true}
                  />

                  <SelectField
                    name="schedulesType"
                    label={t("broadcasts.scheduleSendMessage")}
                    options={schedulesOptions}
                    // onValueChange={(value) =>
                    //   setSchedulesType(value as BroadcastSchedulesType)
                    // }
                    defaultValue="Now"
                  />

                  {schedulesType === "FUTURE" && (
                    <DateTimePicker
                      granularity="minute"
                      displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                      value={add(new Date(), { minutes: 15 })}
                      onChange={(value) => {
                        setValue(
                          "schedulesAt",
                          (value ?? new Date()).toISOString(),
                        )
                      }}
                    />
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`/chatbots/${chatbotId}/broadcasts`}>
                        Cancel
                      </Link>
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        !form.formState.isValid || form.formState.isSubmitting
                      }
                    >
                      {form.formState.isSubmitting && (
                        <Loader2Icon className="animate-spin" />
                      )}
                      {t("common.confirm-btn")}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

const InboxTypeSelect = ({
  inboxTypes,
  onSelectInboxType,
}: {
  inboxTypes: string[]
  onSelectInboxType: (inboxType: InboxType | null) => void
}) => {
  const allTypes = [
    {
      icon: <MessengerIcon />,
      name: "Messenger",
      value: InboxType.MESSENGER,
      description: "",
    },
    {
      icon: <WhatsappIcon />,
      name: "Whatsapp",
      value: InboxType.WHATSAPP,
      description: "",
    },
  ]

  const validTypes = []
  for (const t of allTypes) {
    if (inboxTypes.includes(t.value ?? "")) {
      validTypes.push(t)
    }
  }
  validTypes.push({
    icon: <AtomIcon />,
    name: "Omnichannel",
    value: null,
    description:
      "Send a flow to all contacts. You can send messages or executes actions.",
  })

  return (
    <>
      {validTypes.map((t) => (
        <div className="flex items-center w-full gap-2" key={t.value}>
          <span className="flex-1 flex gap-2">
            {t.icon}
            {t.name}
          </span>
          <Button
            variant="secondary"
            onClick={() => onSelectInboxType(t.value)}
          >
            Continue
          </Button>
        </div>
      ))}
    </>
  )
}
