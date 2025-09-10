"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@aha.chat/ui/components/ui/radio-group"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import type { FacebookPage } from "@/features/integration-messenger/libs"
import { selectPageAction } from "./actions/select-page.action"

const selectPageSchema = z.object({
  pageId: z.string().min(1, "Please select a Facebook page"),
})

type SelectPageForm = z.infer<typeof selectPageSchema>

type SelectPageCardProps = {
  readonly chatbotId: string
  readonly pages: FacebookPage[]
}

export function SelectPageCard({ chatbotId, pages }: SelectPageCardProps) {
  const t = useTranslations()
  const router = useRouter()

  const form = useForm<SelectPageForm>({
    resolver: zodResolver(selectPageSchema),
    defaultValues: {
      pageId: "",
    },
  })

  const { execute, status } = useAction(
    selectPageAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("messenger.pageSelectedSuccessfully"))
        router.push(`/chatbots/${chatbotId}/channel/messenger`)
      },
      onError: (_error) => {
        toast.error(t("messenger.failedToConnectFacebookPage"))
      },
    },
  )

  const onSubmit = (data: SelectPageForm) => {
    const selectedPage = pages.find((page) => page.id === data.pageId)
    if (!selectedPage) {
      toast.error(t("messenger.pageNotFound"))
      return
    }

    execute({
      pageId: data.pageId,
      pageName: selectedPage.name,
      pageAccessToken: selectedPage.access_token,
    })
  }

  const isSubmitting = status === "executing"

  if (pages.length === 0) {
    return (
      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("messenger.selectPageToBegin")}</CardTitle>
            <CardDescription>
              {t("messenger.selectPageToBeginDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                router.push(`/chatbots/${chatbotId}/settings/channels`)
              }
              type="button"
              variant="outline"
            >
              {t("actions.reconnect")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("messenger.selectPageToBegin")}</CardTitle>
          <CardDescription>
            {t("messenger.selectPageToBeginDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="pageId"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormControl>
                      <RadioGroup
                        className="flex flex-col space-y-2"
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        {pages.map((page) => (
                          <div
                            className="flex items-center space-x-2"
                            key={page.id}
                          >
                            <RadioGroupItem
                              id={`page-${page.id}`}
                              value={page.id}
                            />
                            <Label
                              className="flex-1 cursor-pointer"
                              htmlFor={`page-${page.id}`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{page.name}</span>
                                <span className="text-muted-foreground text-sm">
                                  ID: {page.id}
                                </span>
                              </div>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting && <Loader2Icon className="animate-spin" />}
                  {t("actions.connect")}
                </Button>
                <Button
                  disabled={isSubmitting}
                  onClick={() =>
                    router.push(`/chatbots/${chatbotId}/settings/channels`)
                  }
                  type="button"
                  variant="outline"
                >
                  {t("actions.cancel")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
