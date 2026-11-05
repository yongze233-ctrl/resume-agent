import { redirect } from 'next/navigation';
import { siteAccountsEnabled } from '@/lib/auth/server';
import ChangePassword from '@/components/accounts/ChangePassword';
export default function AccountPage(){if(!siteAccountsEnabled())redirect('/dashboard');return <ChangePassword/>;}
