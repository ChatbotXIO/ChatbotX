"use client"

import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { SiMessenger } from "@icons-pack/react-simple-icons"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useUserPersistentMenuOptions } from "@/features/user-persistent-menus/provider/user-persistent-menu-hook"
import { UserPersistentMenuStoreProvider } from "@/features/user-persistent-menus/provider/user-persistent-menu-store-context"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepEditor } from "../base/editor"

// The schema stores an empty string when the page-level persistent menu should
// be used (an empty/falsy id means "page default"). Radix's Select forbids an
// empty-string item value, so we represent that choice with a sentinel and map
// it back to "" on change — this keeps "Page Default" a real, always-selectable
// option rather than relying on clearing the field to `undefined`.
const PAGE_DEFAULT_VALUE = "__page_default__"

const Selector = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const options = useUserPersistentMenuOptions()
  const { control } = useFormContext()

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <Link
        className="self-end text-muted-foreground text-xs hover:underline"
        href={`/space/${workspaceId}/settings/user-persistent-menus`}
        target="_blank"
      >
        {t("actions.addNew")}
      </Link>
      <FormField
        control={control}
        name={`${parentName}.userPersistentMenuId`}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Select
                onValueChange={(value) =>
                  field.onChange(value === PAGE_DEFAULT_VALUE ? "" : value)
                }
                value={field.value || PAGE_DEFAULT_VALUE}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t("fields.userPersistentMenu.pageDefault")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PAGE_DEFAULT_VALUE}>
                    {t("fields.userPersistentMenu.pageDefault")}
                  </SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

const SetMessengerUserPersistentMenuStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  return (
    <UserPersistentMenuStoreProvider
      autoInitialize={true}
      workspaceId={workspaceId}
    >
      <BaseStepEditor
        iconNode={<SiMessenger size={18} />}
        title={t("flows.actions.setMessengerUserPersistentMenu")}
      >
        <Selector parentName={parentName} />
      </BaseStepEditor>
    </UserPersistentMenuStoreProvider>
  )
}

export default SetMessengerUserPersistentMenuStepEditor
