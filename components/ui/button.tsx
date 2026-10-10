'use client'

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'terra' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: React.ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-ink text-canvas border-ink hover:bg-ink-hover hover:border-ink-hover hover:-translate-y-px',
  secondary: 'bg-transparent text-ink border-ink hover:bg-wash',
  terra: 'bg-transparent text-terra-dk border-terra hover:bg-terra-pale',
  danger: 'bg-transparent text-critical border-critical/40 hover:bg-critical-pale hover:border-critical',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-wash hover:text-ink',
}

const sizeStyles: Record<Size, string> = {
  sm: 'min-h-[36px] px-3.5 py-2 text-[13px]',
  md: 'min-h-[44px] px-[1.4rem] py-[.85rem] text-sm',
  lg: 'min-h-[52px] px-6 py-4 text-[15px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] font-semibold leading-none',
        'transition-[background-color,color,border-color,transform] duration-200 ease-editorial',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
