export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col justify-center bg-canvas px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}
