import { redirect } from 'next/navigation';
import { serverAccount, siteAccountsEnabled } from '@/lib/auth/server';
import LoginForm from '@/components/accounts/LoginForm';
export const dynamic = 'force-dynamic';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  if(!siteAccountsEnabled())redirect('/dashboard');
  const requested=(await searchParams).next;
  const next=requested?.startsWith('/dashboard')&&requested.length<2048?requested:'/dashboard';
  if(await serverAccount())redirect(next);
  return <LoginForm next={next}/>;
}
