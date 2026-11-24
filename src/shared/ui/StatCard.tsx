import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/shared/utils/cn'
import { Skeleton } from './Skeleton'

interface StatCardProps {
  label: string
  value: number | string | undefined
  icon?: ReactNode
  to?: string
  tone?: 'default' | 'warning' | 'aqua'
  loading?: boolean
}

export function StatCard({ label, value, icon, to, tone = 'default', loading }: StatCardProps) {
  const inner = (
    <div
      className={cn(
        'flex h-full items-center gap-3 rounded-lg border bg-white px-3.5 py-3 shadow-card transition-all',
        to && 'hover:-translate-y-0.5 hover:shadow-float',
        tone === 'warning' && value !== 0 && value !== undefined
          ? 'border-warning/40'
          : 'border-ice-200',
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            tone === 'aqua'
              ? 'bg-aqua text-navy'
              : tone === 'warning'
                ? 'bg-warning-100 text-warning'
                : 'bg-navy text-aqua',
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold tracking-wide text-steel-600 uppercase">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-0.5 h-6 w-12" />
        ) : (
          <p className="tnum text-xl font-extrabold leading-tight text-navy">{value ?? '—'}</p>
        )}
      </div>
    </div>
  )
  return to ? (
    <Link to={to} className="block h-full rounded-lg focus-visible:outline-2">
      {inner}
    </Link>
  ) : (
    inner
  )
}
