import SettingTabs from "@/features/settings/setting-tabs";

export default async function SettingLayout(
  props: { children: React.ReactNode, params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }
) {
  // { children, params }: { children: React.ReactNode; params: { chatbotId: string }; }
  const params = await props.params


  const tabs = [
    { value: "general", label: "General", path: `/chatbots/${params.chatbotId}/settings/general` },
    { value: "channels", label: "Channels", path: `/chatbots/${params.chatbotId}/settings/channels` },
  ];

  return (
    <div className="px-16 bg-gray-50">
      <SettingTabs tabs={tabs} />
      <div>{props.children}</div>
    </div>
  );
}
