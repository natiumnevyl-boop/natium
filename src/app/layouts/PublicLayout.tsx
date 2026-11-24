import { Outlet } from 'react-router-dom'
import { brand } from '@/config/brand'
import { Logo } from '@/shared/ui/Logo'

/** Minimal chrome for shareable public pages (no authenticated shell). */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-ice">
      <header className="border-b border-ice-200 bg-navy">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo variant="light" compact />
          <p className="hidden text-xs font-semibold tracking-wide text-aqua uppercase sm:block">
            {brand.descriptor}
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-ice-200 bg-white py-4 text-center text-xs text-steel-600">
        © {brand.name}
      </footer>
    </div>
  )
}
