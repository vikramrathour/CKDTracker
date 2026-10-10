'use client'

import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'

export default function SettingsPage() {
  const { user, logOut } = useAuth()

  return (
    <>
      <Header title="Settings" showBack />
      <main className="px-4 py-4 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Account</h3>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <p className="text-sm text-gray-500">{user?.displayName}</p>
        </div>

        <Button variant="danger" className="w-full" onClick={logOut}>
          Sign Out
        </Button>
      </main>
    </>
  )
}
