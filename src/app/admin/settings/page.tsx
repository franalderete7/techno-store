import { CrmTagDefinitionsPanel } from "@/components/settings/crm-tag-definitions-panel";
import { StoreSettingsPanel } from "@/components/settings/store-settings-panel";

export default function AdminSettingsPage() {
  return (
    <>
      <StoreSettingsPanel />
      <CrmTagDefinitionsPanel />
    </>
  );
}
