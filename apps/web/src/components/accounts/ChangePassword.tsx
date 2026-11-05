'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import AgentScaffold from '@/app/dashboard/_components/AgentScaffold';
import { accountRequest, broadcastAccountChange } from '@/lib/auth/browser';
import styles from './accounts.module.css';

export default function ChangePassword() {
  const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{event.preventDefault();if(busy)return;if(newPassword!==confirm){setError('两次输入的新密码不一致。');return;}setBusy(true);setError('');try{await accountRequest('change-password',{currentPassword,newPassword,revokeOtherSessions:true});await accountRequest('sign-out',{});broadcastAccountChange();window.location.replace('/login');}catch(e){setError(e instanceof Error?e.message:'修改失败。');setBusy(false);}};
  return <AgentScaffold><main className={styles.page}><div className={styles.pageInner}><header className={styles.heading}><div><h1>修改密码</h1><p>修改完成后，请使用新密码重新登录。</p></div><Link className={styles.back} href="/dashboard">返回对话</Link></header><section className={`${styles.section} ${styles.ownPassword}`}><form className={styles.form} onSubmit={submit}><label className={styles.field}>当前密码<input className={styles.input} type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} maxLength={128} required/></label><label className={styles.field}>新密码<input className={styles.input} type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNew(e.target.value)} minLength={12} maxLength={128} required/></label><label className={styles.field}>再次输入新密码<input className={styles.input} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={12} maxLength={128} required/></label>{error&&<p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} disabled={busy}>{busy?'正在保存…':'保存新密码'}</button></form></section></div></main></AgentScaffold>;
}
