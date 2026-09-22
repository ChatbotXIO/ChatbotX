import { channelTypes } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

export const allInboxConfigs = {
  omnichannel: {
    label: "Omnichannel",
    value: "omnichannel",
  },
  messenger: {
    label: "Messenger",
    value: "messenger",
  },
  instagram: {
    label: "Instagram",
    value: "instagram",
  },
  whatsapp: {
    label: "Whatsapp",
    value: "whatsapp",
  },
  zalo: {
    label: "Zalo OA",
    value: "zalo",
  },
  telegram: {
    label: "Telegram",
    value: "telegram",
  },
  tiktok: {
    label: "TikTok",
    value: "tiktok",
  },
  webchat: {
    label: "Webchat",
    value: "webchat",
  },
} as const

export const useInboxes = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.inboxesAPI.listAllInboxesAuthenticatedAPI.queryOptions({
      // The unpaginated endpoint: the paginated list caps at 50 rows, which
      // would hide inboxes from every consumer in a workspace with more than 50.
      input: { workspaceId: workspaceId ?? "", includes: ["integration"] },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateInboxes = () => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: orpc.inboxesAPI.listAllInboxesAuthenticatedAPI.key(),
    })
}

export const useInboxList = (options?: { enabled?: boolean }) => {
  const workspaceId = useWorkspaceId()
  const { data } = useInboxes(workspaceId, options)
  return data ?? []
}

export const useConfiguredInboxTypeOptions = (options?: {
  enabled?: boolean
}) => {
  const inboxes = useInboxList(options)

  return useMemo(() => {
    const inboxTypes = new Set<string>(["omnichannel"])
    for (const inbox of inboxes) {
      // Ignore SMTP inbox type
      if (inbox.channel !== channelTypes.enum.smtp) {
        inboxTypes.add(inbox.channel)
      }
    }

    return Array.from(inboxTypes)
      .filter((inboxType) => inboxType in allInboxConfigs)
      .map(
        (inboxType) =>
          allInboxConfigs[inboxType as keyof typeof allInboxConfigs],
      )
  }, [inboxes])
}

export const useInboxOptionsByChannel = (
  channel?: string,
  excludeChannels: string[] = [channelTypes.enum.smtp],
): SelectOption[] => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      inboxes
        .filter((inbox) =>
          !channel || channel === channelTypes.enum.omnichannel
            ? !excludeChannels.includes(inbox.channel)
            : inbox.channel === channel,
        )
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.id,
        })),
    [inboxes, channel, excludeChannels],
  )
}

/**
 * Generalises `useInboxOptionsByChannel` for a caller that supports a FIXED
 * SET of channels rather than a single one (e.g. the Automatic Customer Scan
 * dialog, whose eligible channels come from `CONTACT_SCAN_CHANNELS`
 * `@chatbotx.io/utils/channel`). `useInboxOptionsByChannel` stays as-is for
 * its existing single-channel callers.
 */
export const useInboxOptionsForChannels = (
  channels: readonly string[],
): SelectOption[] => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      inboxes
        .filter((inbox) => channels.includes(inbox.channel))
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.id,
        })),
    [inboxes, channels],
  )
}

export const useWhatsappInboxOptions = (): SelectOption[] => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      inboxes
        .filter((inbox) => inbox.channel === channelTypes.enum.whatsapp)
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.id,
        })),
    [inboxes],
  )
}

export const useMessengerInboxOptions = (): SelectOption[] => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      inboxes
        .filter((inbox) => inbox.channel === channelTypes.enum.messenger)
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.id,
        })),
    [inboxes],
  )
}

export const useSmtpInboxOptions = (): SelectOption[] => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      inboxes
        .filter(
          (inbox) =>
            inbox.channel === channelTypes.enum.smtp && !!inbox.integrationSmtp,
        )
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.integrationSmtp?.id ?? "-",
        })),
    [inboxes],
  )
}

export const useSmtpInboxFromAddressMap = (): Record<string, string> => {
  const inboxes = useInboxList()

  return useMemo(
    () =>
      Object.fromEntries(
        inboxes.flatMap((inbox) =>
          inbox.channel === channelTypes.enum.smtp && inbox.integrationSmtp
            ? [[inbox.integrationSmtp.id, inbox.integrationSmtp.fromAddress]]
            : [],
        ),
      ),
    [inboxes],
  )
}
