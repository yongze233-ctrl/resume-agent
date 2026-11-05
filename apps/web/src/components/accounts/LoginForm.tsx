'use client';
import { useState, type FormEvent } from 'react';
import { accountRequest, broadcastAccountChange } from '@/lib/auth/browser';
import type { SiteUser } from '@/lib/auth/types';
import styles from './accounts.module.css';

export default function LoginForm({next}:{next:string}) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try {
      const result=await accountRequest<{user:SiteUser}>('sign-in/username',{username:username.trim().toLowerCase(),password});
      if(!result.user)throw new Error('登录未完成，请稍后重试。');
      broadcastAccountChange();window.location.replace(next);
    } catch(error){setError(error instanceof Error?error.message:'登录未完成，请稍后重试。');setBusy(false);}
  };
  return <main className={styles.login}><section className={styles.loginCard}>
    <div className={styles.brand}><svg viewBox="0 0 24 28" fill="none" aria-hidden="true"><path d="M4 2h11l5 5v19H4V2Z" stroke="currentColor" strokeWidth="1.6"/><path d="M9 12h6M9 17h6M9 22h3M15 2v6h5" stroke="currentColor" strokeWidth="1.6"/></svg>Resume Agent</div>
    <h1>登录你的工作空间</h1><p className={styles.description}>使用管理员提供的测试账号继续。</p>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>账号<input className={styles.input} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus value={username} onChange={e=>setUsername(e.target.value)} required maxLength={30}/></label>
      <label className={styles.field}>密码<div className={styles.password}><input className={styles.input} type={visible?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128}/><button className={styles.reveal} type="button" aria-label={visible?'隐藏密码':'显示密码'} onClick={()=>setVisible(v=>!v)}>{visible?'隐藏':'显示'}</button></div></label>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <button className={styles.primary} disabled={busy} type="submit">{busy?'正在登录…':'登录'}</button>
    </form>
  </section></main>;
}
