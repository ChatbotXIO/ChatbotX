"use client"

import type { InstagramAccount } from "@chatbotx.io/integration-instagram-facebook"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { selectFacebookAccountAction } from "../actions/select-account-facebook.action"
import { selectFacebookAccountRequest } from "../schemas/action-facebook"

type SelectFacebookAccountsProps = {
  accounts: InstagramAccount[]
  workspaceId: string
  version?: string
}

export function SelectFacebookAccounts({
  accounts,
  workspaceId,
  version,
}: SelectFacebookAccountsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selected = accounts[selectedIndex]

  const { form, handleSubmitWithAction } = useHookFormAction(
    selectFacebookAccountAction,
    zodResolver(selectFacebookAccountRequest),
    {
      formProps: {
        mode: "onChange",
        defaultValues: {
          workspaceId,
          igId: selected?.id ?? "",
          igName: selected?.name ?? "",
          igUsername: selected?.username ?? "",
          pageId: selected?.pageId ?? "",
          pageAccessToken: selected?.pageAccessToken ?? "",
          version,
        },
      },
      actionProps: {
        onSuccess: ({ data }) => {
          if (workspaceId) {
            router.push(
              `/space/${data?.workspaceId}/settings/channels?channel=instagram`,
            )
          } else {
            router.push("/")
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      errorMapProps: {},
    },
  )

  const handleSelectAccount = (index: number) => {
    const account = accounts[index]
    if (!account) {
      return
    }
    setSelectedIndex(index)
    form.setValue("igId", account.id)
    form.setValue("igName", account.name)
    form.setValue("igUsername", account.username)
    form.setValue("pageId", account.pageId)
    form.setValue("pageAccessToken", account.pageAccessToken)
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <div className="hidden">
          <InputField name="igId" type="hidden" />
          <InputField name="pageAccessToken" type="hidden" />
          <InputField name="igName" type="hidden" />
          <InputField name="igUsername" type="hidden" />
          <InputField name="pageId" type="hidden" />
          <InputField name="version" type="hidden" />
        </div>

        <div className="space-y-2">
          {accounts.map((account, index) => (
            <button
              className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                selectedIndex === index
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
              key={account.id}
              onClick={() => handleSelectAccount(index)}
              type="button"
            >
              {account.profile_picture_url && (
                <Image
                  alt={account.name}
                  className="size-12 rounded-full object-cover"
                  height={48}
                  src={account.profile_picture_url}
                  width={48}
                />
              )}
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-muted-foreground text-sm">
                  @{account.username}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/space/${workspaceId}/settings/channels?channel=instagram`}
            >
              {t("actions.cancel")}
            </Link>
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.continue")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
