import { getMessaging, getToken, onMessage, type MessagePayload } from 'firebase/messaging'
import app from './config'

function getMessagingInstance() {
  if (typeof window === 'undefined' || !app) return null
  return getMessaging(app)
}

export async function requestNotificationPermission(): Promise<string | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const messaging = getMessagingInstance()
  if (!messaging) return null

  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  })
  return token
}

export function onMessageListener(callback: (payload: MessagePayload) => void) {
  const messaging = getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}
