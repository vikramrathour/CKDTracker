'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { useToast } from '@/components/providers/toast-provider'
import { cn } from '@/lib/utils'
import {
  disablePush,
  enablePush,
  getPushState,
  isPushEnabledHere,
  sendTestNotification,
  type PushState,
} from '@/lib/firebase/messaging'
import { saveNotificationPrefs, subscribeNotificationPrefs } from '@/lib/firebase/notifications'
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_TYPES,
  type NotificationPrefs,
  type NotificationType,
} from '@/lib/notifications/prefs'

const DEFAULT_QUIET = { start: '22:00', end: '07:00' }

function Switch({
  id,
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  labelledBy: string
  describedBy?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-editorial',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'border-ink bg-ink' : 'border-hair-2 bg-recess'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-[18px] w-[18px] rounded-full shadow-soft transition-transform duration-200 ease-editorial',
          checked ? 'translate-x-[22px] bg-canvas' : 'translate-x-[3px] bg-vellum'
        )}
      />
    </button>
  )
}

function deviceMessage(state: PushState | null, enabledHere: boolean): string {
  switch (state) {
    case null:
      return 'Checking this device…'
    case 'unsupported':
      return 'This browser can’t receive push notifications. On iPhone, add CKD Tracker to your Home Screen and open it from there.'
    case 'unconfigured':
      return 'Push notifications aren’t set up on this server yet.'
    case 'denied':
      return 'Notifications are blocked for CKD Tracker. Allow them in your browser or phone settings, then reload.'
    default:
      return enabledHere
        ? 'On for this device. Notifications never show lab values on the lock screen.'
        : 'Off for this device. Turn on to get reminders and alerts here.'
  }
}

/** Settings → Notifications: device push opt-in, per-type toggles, quiet hours, test send. */
export function NotificationSettings() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const uid = user?.uid ?? null

  const [state, setState] = useState<PushState | null>(null)
  const [enabledHere, setEnabledHere] = useState(false)
  const [busy, setBusy] = useState<'enable' | 'disable' | 'test' | null>(null)
  const [error, setError] = useState('')
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)

  const refreshDevice = useCallback(async () => {
    setState(await getPushState())
    setEnabledHere(isPushEnabledHere())
  }, [])

  useEffect(() => {
    void refreshDevice()
  }, [refreshDevice])

  useEffect(() => {
    if (!uid) return
    return subscribeNotificationPrefs(uid, setPrefs)
  }, [uid])

  async function save(next: NotificationPrefs) {
    if (!uid) return
    const previous = prefs
    setPrefs(next)
    try {
      await saveNotificationPrefs(uid, next)
    } catch {
      setPrefs(previous)
      showToast('error', 'Couldn’t save notification settings')
    }
  }

  async function handleEnable() {
    if (!uid) return
    setError('')
    setBusy('enable')
    try {
      await enablePush(uid)
      showToast('success', 'Notifications are on for this device')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t turn on notifications')
    } finally {
      setBusy(null)
      await refreshDevice()
    }
  }

  async function handleDisable() {
    if (!uid) return
    setError('')
    setBusy('disable')
    try {
      await disablePush(uid)
    } finally {
      setBusy(null)
      await refreshDevice()
    }
  }

  async function handleTest() {
    setError('')
    setBusy('test')
    try {
      await sendTestNotification()
      showToast('success', 'Test sent. It should arrive in a few seconds.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send a test notification')
    } finally {
      setBusy(null)
    }
  }

  const canEnable = state === 'default' || (state === 'granted' && !enabledHere)
  // Push can't work on this device: lock the per-type choices instead of
  // letting them look active. (They still apply from devices where it works.)
  const pushBlocked = state === 'unsupported' || state === 'unconfigured' || state === 'denied'
  const prefsDisabled = !uid || pushBlocked
  const quiet = prefs.quietHours

  return (
    <section className="rounded-card border border-hair bg-vellum p-5" aria-labelledby="notifications-heading">
      <h3 id="notifications-heading" className="label mb-1 text-ink-3">
        Notifications
      </h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">{deviceMessage(state, enabledHere)}</p>

      <div className="flex flex-wrap gap-2">
        {canEnable && (
          <Button size="sm" onClick={handleEnable} loading={busy === 'enable'}>
            <Bell className="h-4 w-4" aria-hidden />
            Turn on for this device
          </Button>
        )}
        {enabledHere && state === 'granted' && (
          <>
            <Button size="sm" variant="secondary" onClick={handleTest} loading={busy === 'test'}>
              <Send className="h-4 w-4" aria-hidden />
              Send a test
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisable} loading={busy === 'disable'}>
              <BellOff className="h-4 w-4" aria-hidden />
              Turn off here
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-critical">
          {error}
        </p>
      )}

      {pushBlocked && (
        <p id="prefs-blocked-note" className="mt-5 text-[13px] leading-relaxed text-ink-3">
          {state === 'denied'
            ? 'Allow notifications for CKD Tracker to choose which ones you get.'
            : 'Choose which notifications you get on a device that can receive them.'}
        </p>
      )}

      <ul className={cn('divide-y divide-hair border-y border-hair', pushBlocked ? 'mt-3' : 'mt-5')}>
        {NOTIFICATION_TYPES.map(({ key, label, description }) => (
          <li key={key} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p id={`pref-${key}-label`} className="text-sm font-semibold text-ink">
                {label}
              </p>
              <p id={`pref-${key}-desc`} className="text-[13px] leading-snug text-ink-3">
                {description}
              </p>
            </div>
            <Switch
              id={`pref-${key}`}
              checked={prefs[key as NotificationType]}
              onChange={(v) => save({ ...prefs, [key]: v })}
              labelledBy={`pref-${key}-label`}
              describedBy={pushBlocked ? `pref-${key}-desc prefs-blocked-note` : `pref-${key}-desc`}
              disabled={prefsDisabled}
            />
          </li>
        ))}
        <li className="py-3">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p id="pref-quiet-label" className="text-sm font-semibold text-ink">
                Quiet hours
              </p>
              <p id="pref-quiet-desc" className="text-[13px] leading-snug text-ink-3">
                No notifications in this window (India time). Alerts wait until it ends.
              </p>
            </div>
            <Switch
              id="pref-quiet"
              checked={!!quiet}
              onChange={(v) => save({ ...prefs, quietHours: v ? DEFAULT_QUIET : null })}
              labelledBy="pref-quiet-label"
              describedBy={pushBlocked ? 'pref-quiet-desc prefs-blocked-note' : 'pref-quiet-desc'}
              disabled={prefsDisabled}
            />
          </div>
          {quiet && (
            <div className="mt-3 flex items-end gap-3">
              <label className="flex-1">
                <span className="label mb-1.5 block text-ink-3">From</span>
                <input
                  type="time"
                  className="field num"
                  disabled={prefsDisabled}
                  value={quiet.start}
                  onChange={(e) => e.target.value && save({ ...prefs, quietHours: { ...quiet, start: e.target.value } })}
                />
              </label>
              <label className="flex-1">
                <span className="label mb-1.5 block text-ink-3">Until</span>
                <input
                  type="time"
                  className="field num"
                  disabled={prefsDisabled}
                  value={quiet.end}
                  onChange={(e) => e.target.value && save({ ...prefs, quietHours: { ...quiet, end: e.target.value } })}
                />
              </label>
            </div>
          )}
        </li>
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        These choices apply to all your devices and to every person you follow in your care circle.
      </p>
    </section>
  )
}
