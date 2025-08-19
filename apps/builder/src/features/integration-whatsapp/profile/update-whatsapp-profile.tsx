"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { updateWhatsappProfileAction } from "./actions/update-whatsapp-profile.action"
import { updateWhatsappProfileRequest } from "./schemas/update-whatsapp-profile.request"

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
      <form className="flex flex-col gap-2" onSubmit={handleSubmitWithAction}>
        <InputField label="About" name="about" />
        <InputField label="Description" name="description" />
        <InputField label="Address" name="address" />
        <InputField label="Email" name="email" />
        <InputField label="Website URL" name="websiteUrl" />

        <div className="flex w-full justify-center">
          <Button>
            <T keyName="common.confirmBtn" />
          </Button>
        </div>
      </form>
    </Form>
  )
}
