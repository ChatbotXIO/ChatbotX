"use client"

import { InputField } from "@/components/form/input-field"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { updateWhatsappProfileRequest } from "./schemas/update-whatsapp-profile.request"
import { updateWhatsappProfileAction } from "./actions/update-whatsapp-profile.action"
import { Button } from "@/components/ui/button"
import { T } from "@tolgee/react"

export function UpdateWhatsappProfile({ chatbotId }: { chatbotId: string }) {
  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWhatsappProfileAction.bind(null, chatbotId),
    zodResolver(updateWhatsappProfileRequest),
    {
      actionProps: {},
      formProps: {},
      errorMapProps: {},
    },
  )

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction} className="flex flex-col gap-2">
        <InputField name="about" label="About" />
        <InputField name="description" label="Description" />
        <InputField name="address" label="Address" />
        <InputField name="email" label="Email" />
        <InputField name="websiteUrl" label="Website URL" />

        <div className="flex w-full justify-center">
          <Button>
            <T keyName="common.confirmBtn" />
          </Button>
        </div>
      </form>
    </Form>
  )
}
