"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent, DialogDescription, DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Team } from "@ahachat.ai/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { useTranslate } from '@tolgee/react';
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import "react-day-picker/style.css";
import { toast } from "sonner";
import { updateTeamAction } from "./actions/update-team-action";
import { updateTeamSchema } from "./schemas/update-team-schema";
import { useEffect } from "react";

export function UpdateTeamDialog({
  open,
  onOpenChange,
  chatbotId,
  team
}: {
  open: boolean,
  onOpenChange: (val: boolean) => void,
  chatbotId: string,
  team: Team | null,
}) {
  const { t } = useTranslate();
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction
  } = useHookFormAction(updateTeamAction.bind(null, chatbotId, team?.id ?? "",), zodResolver(updateTeamSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Team update successfully`)

        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      }
    },
    formProps: {
      mode: "onChange",
      defaultValues: {
        name: team?.name || "",
      },
    },
    errorMapProps: {}
  });

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name,
      });
    }
  }, [team, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('team.update.title')}: {team?.name}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel-btn')}</Button>
                <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
                  {t('common.confirm-btn')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
