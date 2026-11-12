import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { loadFinanceContext } from "@/features/finance-context";
import { saveProfile } from "@/features/profile/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  await requireUser();
  const profile = await loadFinanceContext().then((c) => c.profile);
  const zones = Intl.supportedValuesOf("timeZone");
  const timezones = zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones];
  return (
    <>
      <PageHeader title="Profile" description="Reporting currency and timezone." />
      <ProfileForm
        action={saveProfile}
        timezones={timezones}
        initial={{
          display_name: profile.displayName ?? "",
          base_currency: profile.baseCurrency,
          timezone: profile.timezone,
        }}
      />
    </>
  );
}
