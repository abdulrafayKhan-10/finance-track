import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { getProfile } from "@/data/repositories/profile";
import { saveProfile } from "@/features/profile/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  await requireUser();
  const profile = await getProfile();
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
