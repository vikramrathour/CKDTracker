'use client'

import { ArrowLeft, Settings, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'

interface HeaderProps {
  title: string
  subtitle?: string
  showBack?: boolean
  actions?: React.ReactNode
}

export function Header({ title, subtitle, showBack, actions }: HeaderProps) {
  const router = useRouter()
  const { logOut } = useAuth()

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={() => router.back()} className="p-1 -ml-1 text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button
            onClick={() => router.push('/settings')}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
