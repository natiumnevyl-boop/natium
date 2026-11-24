import { cn } from '@/shared/utils/cn'

export function Avatar({
  name,
  src,
  className,
  size = 'md',
}: {
  name: string
  src?: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          'inline-flex shrink-0 rounded-full object-cover ring-1 ring-ice-200',
          size === 'sm' && 'size-7',
          size === 'md' && 'size-9',
          size === 'lg' && 'size-14',
          className,
        )}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-ocean font-bold text-white',
        size === 'sm' && 'size-7 text-[10px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-14 text-lg',
        className,
      )}
    >
      {initials || '?'}
    </span>
  )
}
