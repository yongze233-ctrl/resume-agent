'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AgentScaffold from '@/app/dashboard/_components/AgentScaffold';
import { accountRequest } from '@/lib/auth/browser';
import type { SiteUser } from '@/lib/auth/types';
import styles from './accounts.module.css';

export default function UserAdministration() {
  const [users,setUsers]=useState<SiteUser[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [username,setUsername]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false);
  const [created,setCreated]=useState<{username:string;password:string}|null>(null);
  const [resetId,setResetId]=useState<string|null>(null),[newPassword,setNewPassword]=useState('');
  const refresh=useCallback(async()=>{const result=await accountRequest<{users:SiteUser[]}>('admin/list-users?limit=100&sortBy=createdAt&sortDirection=desc');setUsers(result.users);},[]);
  useEffect(()=>{let alive=true;void accountRequest<{users:SiteUser[]}>('admin/list-users?limit=100&sortBy=createdAt&sortDirection=desc').then(result=>{if(alive)setUsers(result.users);}).catch(()=>{if(alive)setError('用户列表暂时无法读取。');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
  const create=async(event:FormEvent)=>{event.preventDefault();if(busy)return;setBusy(true);setError('');setCreated(null);try{await accountRequest('admin/create-user',{name:name.trim()||username.trim(),password,data:{username:username.trim().toLowerCase()}});setCreated({username:username.trim().toLowerCase(),password});setUsername('');setName('');setPassword('');await refresh();}catch(e){setError(e instanceof Error?e.message:'创建失败。');}finally{setBusy(false);}};
  const toggle=async(user:SiteUser)=>{if(busy)return;setBusy(true);setError('');try{await accountRequest(user.disabled?'admin/unban-user':'admin/ban-user',{userId:user.id});await refresh();}catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy(false);}};
  const reset=async(event:FormEvent)=>{event.preventDefault();if(busy||!resetId)return;setBusy(true);setError('');try{await accountRequest('admin/set-user-password',{userId:resetId,newPassword});setResetId(null);setNewPassword('');}catch(e){setError(e instanceof Error?e.message:'重置失败。');}finally{setBusy(false);}};
  const generate=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const bytes=crypto.getRandomValues(new Uint8Array(18));setPassword(Array.from(bytes,value=>alphabet[value%alphabet.length]).join(''));setShow(true);};
  return <AgentScaffold><main className={styles.page}><div className={styles.pageInner}>
    <header className={styles.heading}><div><h1>测试用户</h1><p>开通账号，管理访问权限。每个账号的资料与会话独立。</p></div><Link className={styles.back} href="/dashboard">返回对话</Link></header>
    <section className={styles.section}><h2>创建账号</h2><form onSubmit={create}>
      <div className={styles.createGrid}>
        <label className={styles.field}>账号名<input className={styles.input} value={username} onChange={e=>setUsername(e.target.value)} placeholder="例如 tester01" autoComplete="off" pattern="[A-Za-z0-9_-]{3,30}" required maxLength={30}/></label>
        <label className={styles.field}>称呼<input className={styles.input} value={name} onChange={e=>setName(e.target.value)} placeholder="方便你识别的名字" maxLength={80}/></label>
        <label className={styles.field}>初始密码<div className={styles.password}><input className={styles.input} type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required/><button type="button" className={styles.reveal} onClick={()=>setShow(v=>!v)}>{show?'隐藏':'显示'}</button></div></label>
      </div>
      <div className={styles.formFooter}><span className={styles.notice}>账号名 3–30 位，密码至少 12 位。<button type="button" className={styles.smallButton} onClick={generate}>生成密码</button></span><button className={styles.primary} disabled={busy}>创建账号</button></div>
    </form>
    {created&&<div className={styles.success} role="status">账号 <strong>{created.username}</strong> 已创建。<button className={styles.smallButton} type="button" onClick={()=>void navigator.clipboard.writeText(`登录地址：${location.origin}\n账号：${created.username}\n初始密码：${created.password}`)}>复制登录信息</button></div>}
    </section>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.listHeader}><h2>账号列表 <span className={styles.muted}>{users.length}</span></h2><button type="button" className={styles.smallButton} onClick={()=>void refresh().catch(()=>setError('用户列表暂时无法读取。'))}>刷新列表</button></div>
    {loading?<p className={styles.notice}>正在读取账号…</p>:<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td><div className={styles.accountName}><strong>{user.name}</strong><span className={styles.muted}>{user.username}</span></div></td><td><span className={`${styles.status} ${user.disabled?'':styles.active}`}>{user.disabled?'已停用':'可使用'}</span></td><td className={styles.muted}>{new Date(user.createdAt).toLocaleDateString('zh-CN')}</td><td>{user.role==='admin'?<span className={styles.muted}>管理员</span>:<><div className={styles.actions}><button disabled={busy} className={user.disabled?'':styles.danger} type="button" onClick={()=>void toggle(user)}>{user.disabled?'启用':'停用'}</button><button disabled={busy} type="button" onClick={()=>{setResetId(resetId===user.id?null:user.id);setNewPassword('');}}>重置密码</button></div>{resetId===user.id&&<form className={styles.reset} onSubmit={reset}><label className={styles.field}>新的密码<input className={styles.input} type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required/></label><button className={styles.primary} disabled={busy}>保存新密码</button><span className={styles.notice}>重置后，该账号需要重新登录。</span></form>}</>}</td></tr>)}</tbody></table></div>}
  </div></main></AgentScaffold>;
}
