import { Metadata } from "next";
import SettingsHost from "@/components/settings/SettingsHost";
import metaConfig from "@/lib/constants/metaConfig";
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverAccount, siteAccountsEnabled } from '@/lib/auth/server';

export const metadata: Metadata = metaConfig.Dashboard;
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
  modal
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  if (siteAccountsEnabled()) {
    const account = await serverAccount();
    const path = (await headers()).get('x-resume-return-path') ?? '/dashboard';
    if (!account) redirect(`/login?next=${encodeURIComponent(path)}`);
    // Correct a missing or stale public namespace marker before private browser
    // stores can hydrate. The HttpOnly session remains the authority.
    if ((await cookies()).get('resume_user_id')?.value !== account.id) {
      redirect(`/api/auth/refresh?next=${encodeURIComponent(path)}`);
    }
  }
  return (
    <div className="flex h-screen flex-col bg-desk text-white overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
        {modal}
      </div>
      {/* Settings dialog for the dashboard and the editor */}
      <SettingsHost />
    </div>
  );
}
