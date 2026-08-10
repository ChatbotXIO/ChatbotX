"use client"

import {
  type ChannelType,
  CREATABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { updatePlatformChannelsSchema } from "./schema"
import {
  updatePlatformChannelsAction,
  updateRootPlatformChannelsAction,
} from "./update-platform-channels.action"

type PlatformChannelsSettingsProps = {
  hiddenChannels: ChannelType[]
  /**
   * `"tenant"` (default): white-label owner narrowing what their own users
   * can create, bounded by `platformHiddenChannels`.
   * `"platform"`: the SaaS operator setting the ceiling for every tenant.
   */
  scope?: "tenant" | "platform"
  /**
   * Channels the platform has already hidden — only meaningful in `"tenant"`
   * scope. Rendered as disabled + checked with an explanatory tooltip, since
   * a reseller can narrow what the platform allows but never widen it.
   */
  platformHiddenChannels?: ChannelType[]
}

export function PlatformChannelsSettings({
  hiddenChannels,
  scope = "tenant",
  platformHiddenChannels = [],
}: PlatformChannelsSettingsProps) {
  const t = useTranslations()
  const router = useRouter()
  const action =
    scope === "platform"
      ? updateRootPlatformChannelsAction
      : updatePlatformChannelsAction
  const platformHiddenSet = new Set(platformHiddenChannels)

  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(updatePlatformChannelsSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("platformChannels.title"),
            }),
          )
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        defaultValues: { hiddenChannels },
      },
    },
  )

  const selectedHidden = useWatch({
    control: form.control,
    name: "hiddenChannels",
  })

  const toggleChannel = (channel: ChannelType, checked: boolean) => {
    // `useWatch` can return `undefined` for the field before RHF applies
    // `defaultValues` on the first render — guard the spread/filter so a
    // click in that window can't throw.
    const current = selectedHidden ?? []
    const next = checked
      ? [...current, channel]
      : current.filter((value) => value !== channel)
    form.setValue("hiddenChannels", next, { shouldDirty: true })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
      <Card>
        <CardHeader>
          <CardTitle>{t("platformChannels.title")}</CardTitle>
          <CardDescription>{t("platformChannels.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {CREATABLE_CHANNELS.map((channel) => {
              const forcedByPlatform =
                scope === "tenant" && platformHiddenSet.has(channel)
              const checked =
                forcedByPlatform || selectedHidden.includes(channel)
              const item = (
                <li className="flex items-center gap-3" key={channel}>
                  <Checkbox
                    checked={checked}
                    disabled={forcedByPlatform}
                    id={`hide-channel-${channel}`}
                    onCheckedChange={(value) =>
                      toggleChannel(channel, value === true)
                    }
                  />
                  <Label
                    className="flex flex-1 cursor-pointer items-center gap-2 font-normal"
                    htmlFor={`hide-channel-${channel}`}
                  >
                    <InboxIcon channel={channel} />
                  </Label>
                </li>
              )

              if (!forcedByPlatform) {
                return item
              }

              return (
                <Tooltip key={channel}>
                  <TooltipTrigger render={item} />
                  <TooltipContent>
                    {t("platformChannels.hiddenByPlatform")}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </ul>
          <p className="text-muted-foreground text-xs">
            {t("platformChannels.hint")}
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
