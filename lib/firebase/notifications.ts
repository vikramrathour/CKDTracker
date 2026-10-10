import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './config'
import { normalizePrefs, type NotificationPrefs } from '@/lib/notifications/prefs'

/** users/{uid}.notificationPrefs, normalised (defaults filled in). */
export function subscribeNotificationPrefs(
  uid: string,
  cb: (prefs: NotificationPrefs) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    cb(normalizePrefs(null))
    return () => {}
  }
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(normalizePrefs(snap.exists() ? snap.get('notificationPrefs') : null)),
    (err) => onError?.(err)
  )
}

export async function saveNotificationPrefs(uid: string, prefs: NotificationPrefs): Promise<void> {
  if (!db) throw new Error('Firebase not initialized')
  const clean = normalizePrefs(prefs)
  await setDoc(doc(db, 'users', uid), { notificationPrefs: { ...clean, quietHours: clean.quietHours ?? null } }, { merge: true })
}
