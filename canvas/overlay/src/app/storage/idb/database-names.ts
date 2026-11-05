import { accountStorageKey } from '@/app/storage/account-scope'

/** Stable, account-scoped names for the app's independent IndexedDB databases. */
export const APP_DATABASE_NAMES = {
  chats: accountStorageKey('open-pencil-chats'),
  credentials: accountStorageKey('open-pencil-credentials'),
  libraries: accountStorageKey('open-pencil-libraries'),
  localCanvas: accountStorageKey('open-pencil-cloud-local'),
  outbox: accountStorageKey('open-pencil-cloud-outbox'),
  recovery: accountStorageKey('open-pencil-recovery'),
  diagnostics: accountStorageKey('open-pencil-diagnostics'),
  skills: accountStorageKey('open-pencil-skills'),
  /** Written and deleted once per page, to learn whether the engine stores Blobs. */
  blobProbe: accountStorageKey('open-pencil-blob-probe')
} as const
