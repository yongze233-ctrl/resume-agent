'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountRequest, AUTH_EVENT_KEY, broadcastAccountChange, browserAccountId, loginDestination } from '@/lib/auth/browser';
import type { SiteUser } from '@/lib/auth/types';
import styles from './accounts.module.css';

export default function AccountSession() {
  const [user,setUser]=useState<SiteUser|null>(null),[busy,setBusy]=useState(false);
  const [initialAccount]=useState(browserAccountId);
  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{
      try {
        const result=await accountRequest<{enabled:boolean;user:SiteUser|null}>('get-session');
        if(!alive||!result.enabled)return;
        if(!result.user){window.location.replace(loginDestination());return;}
        if(result.user.id!==initialAccount){window.location.replace('/dashboard');return;}
        setUser(result.user);
      }catch{/* A temporary backend restart does not discard the current workspace. */}
    };
    const switched=(event:StorageEvent)=>{if(event.key===AUTH_EVENT_KEY){window.location.replace(browserAccountId()?'/dashboard':loginDestination());}};
    const focused=()=>{void refresh();};
    void refresh();const timer=setInterval(focused,30000);
    window.addEventListener('storage',switched);window.addEventListener('focus',focused);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('storage',switched);window.removeEventListener('focus',focused);};
  },[initialAccount]);
  const logout=async()=>{if(busy)return;setBusy(true);try{await accountRequest('sign-out',{});broadcastAccountChange();window.location.replace('/login');}catch{setBusy(false);}};
  if(!user)return null;
  return <div className={styles.accountMenu}><div className={styles.identity}><span title={user.username}>{user.name||user.username}</span><span className={styles.role}>{user.role==='admin'?'管理员':'测试用户'}</span></div><div className={styles.accountLinks}>{user.role==='admin'&&<Link href="/dashboard/admin/users">用户管理</Link>}<Link href="/dashboard/account">修改密码</Link><button type="button" disabled={busy} onClick={()=>void logout()}>{busy?'正在退出…':'退出登录'}</button></div></div>;
}
