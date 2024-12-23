import SettingTabs from "@/features/settings/setting-tabs";

export default function SettingLayout({ children, params, }: { children: React.ReactNode; params: { chatbotId: string }; }) {
  const tabs = [
    { value: "general", label: "General", path: `/chatbots/${params.chatbotId}/settings/general` },
    { value: "channels", label: "Channels", path: `/chatbots/${params.chatbotId}/settings/channels` },
  ];

  return (
    <div className="px-16 bg-gray-50">
      <SettingTabs tabs={tabs} />
      <div>{children}</div>
    </div>
  );
}
