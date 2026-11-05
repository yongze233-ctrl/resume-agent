import { redirect } from 'next/navigation';
import { serverAccount } from '@/lib/auth/server';
import UserAdministration from '@/components/accounts/UserAdministration';
export default async function UsersPage(){if((await serverAccount())?.role!=='admin')redirect('/dashboard');return <UserAdministration/>;}
