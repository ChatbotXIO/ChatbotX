import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type FormData = {
  email: string;
  superAdmin: boolean;
  permissions: {
    analytics: boolean;
    contacts: boolean;
    viewEmailPhone: boolean;
    broadcasts: boolean;
    ecommerce: boolean;
    flows: boolean;
  };
  notifyAdmin: boolean;
  newMessage: boolean;
  emailNotification: boolean;
  browserNotification: boolean;
};

export default function AdminNotificationForm() {
  const form = useForm<FormData>({
    defaultValues: {
      email: "gmeo2022@gmail.com",
      superAdmin: true,
      permissions: {
        analytics: true,
        contacts: true,
        viewEmailPhone: true,
        broadcasts: true,
        ecommerce: true,
        flows: true,
      },
      notifyAdmin: true,
      newMessage: false,
      emailNotification: false,
      browserNotification: true,
    },
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };
  const superAdminChecked = form.watch("superAdmin");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email for Admins Notification</FormLabel>
              <FormControl>
                <Input placeholder="Enter email" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Permissions</h3>
          <FormField
            control={form.control}
            name="superAdmin"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(value) => {
                      field.onChange(value);

                      form.setValue("permissions", {
                        analytics: value,
                        contacts: value,
                        viewEmailPhone: value,
                        broadcasts: value,
                        ecommerce: value,
                        flows: value,
                      });
                    }}
                  />
                </FormControl>
                <FormLabel className="mb-0">Super Admin</FormLabel>
              </FormItem>
            )}
          />
          {!superAdminChecked && (
            <>
              <FormField
                control={form.control}
                name="permissions.analytics"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">Analytics</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions.contacts"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">Contacts / Inbox</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions.viewEmailPhone"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">
                      View email and phone of contacts
                    </FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions.broadcasts"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">Broadcasts</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions.ecommerce"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">Ecommerce</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="permissions.flows"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mb-0">Flows</FormLabel>
                  </FormItem>
                )}
              />
            </>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Notification Type</h3>
          <FormField
            control={form.control}
            name="notifyAdmin"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="mb-0">Notify admin</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newMessage"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="mb-0">New message to human</FormLabel>
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Notification Channels</h3>
          <FormField
            control={form.control}
            name="emailNotification"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="mb-0">Email</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="browserNotification"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="mb-0">Browser Notification</FormLabel>
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-between">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Form>
  );
}
