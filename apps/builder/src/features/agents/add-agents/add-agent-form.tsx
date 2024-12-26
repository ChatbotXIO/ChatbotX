"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useTranslate } from "@tolgee/react";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { addAgentAction } from "./add-agent-action";
import { addAgentSchema, ChatbotMemberRole } from "./add-agent-schema";

export function AddAgentForm({
  onSubmmited,
  onCancelled,
}: {
  onSubmmited?: () => void;
  onCancelled?: () => void;
}) {
  const { t } = useTranslate();

  const items = [
    { id: "superAdmin", label: "Super Admin" },
    { id: "analytics", label: t("common.analytics") },
    { id: "flows", label: t("common.flows") },
    {
      id: "contactsInbox",
      label: `${t("common.contacts")} / ${t("common.inbox")}`,
    },
    { id: "contactView", label: t("common.contactView") },
    { id: "broadcasts", label: t("common.broadcasts") },
    { id: "ecommerce", label: t("common.ecommerce") },
  ] as const;

  const { form, handleSubmitWithAction } = useHookFormAction(
    addAgentAction,
    zodResolver(addAgentSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Agent added successfully");
          onSubmmited && onSubmmited();
        },
        onError: ({ error }) => {
          if (error.serverError) {
            console.error("Server Error:", error.serverError.message);
            toast.error(
              error.serverError.message ?? "An unexpected error occurred.",
            );
          } else {
            console.error("Validation Error:", error.validationErrors);
            toast.error("Please fix the validation errors and try again.");
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          userId: "",
          role: ChatbotMemberRole.AGENT,
          permissions: [],
          isAdmin: true,
          enableAnalytics: true,
          enableFlows: true,
          enableContacts: true,
          enableOnlyAssignedContacts: true,
          enableEmailAndPhone: true,
          enableBroadcast: true,
          enableEcommerce: true,
        },
      },
      errorMapProps: {},
    },
  );

  const handleCheckboxChange = (checked: boolean, itemId: string) => {
    if (itemId === "superAdmin") {
      const updatedPermissions = checked ? items.map((item) => item.id) : [];
      form.setValue("permissions", updatedPermissions);
    } else {
      const currentValues = form.getValues("permissions") || [];
      const updatedValues = checked
        ? [...currentValues, itemId]
        : currentValues.filter((id: string) => id !== itemId);
      form.setValue("permissions", updatedValues);
    }
  };

  const permissions = form.watch("permissions") || [];
  const isSuperAdminSelected = permissions.includes("superAdmin");

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction} className="space-y-8">
        <FormField
          control={form.control}
          name="permissions"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <strong className="text-base">{t("common.permissions")}</strong>
              </div>
              {items.map((item) => {
                if (item.id !== "superAdmin" && isSuperAdminSelected) {
                  return null;
                }
                return (
                  <FormField
                    key={item.id}
                    control={form.control}
                    name="permissions"
                    render={({ field }) => (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-start space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={permissions.includes(item.id)}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(checked === true, item.id)
                            }
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                );
              })}
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between w-full">
          <Button type="button" variant="outline" onClick={onCancelled}>
            {t("common.cancel-btn")}
          </Button>
          <Button type="submit">{t("common.continue")}</Button>
        </div>
      </form>
    </Form>
  );
}
