export interface SiteUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  disabled: boolean;
  createdAt: string;
}
