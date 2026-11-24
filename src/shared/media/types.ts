export type MediaKind = 'logo' | 'avatar' | 'cover' | 'photo'

export type MediaBucket =
  | 'org-assets'
  | 'competition-assets'
  | 'team-logos'
  | 'athlete-photos'
  | 'profile-avatars'

export interface MediaConstraints {
  kind: MediaKind
  /** CSS aspect-ratio for the preview frame (e.g. '1 / 1'). */
  aspect: string
  /** object-fit for preview. Logos use contain to preserve marks. */
  fit: 'contain' | 'cover'
  maxBytes: number
  maxEdgePx: number
  accept: string
  /** Allow SVG (logos only). */
  allowSvg?: boolean
}

export const MEDIA_PRESETS: Record<MediaKind, MediaConstraints> = {
  logo: {
    kind: 'logo',
    aspect: '1 / 1',
    fit: 'contain',
    maxBytes: 2 * 1024 * 1024,
    maxEdgePx: 1024,
    accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
    allowSvg: true,
  },
  avatar: {
    kind: 'avatar',
    aspect: '3 / 4',
    fit: 'cover',
    maxBytes: 2 * 1024 * 1024,
    maxEdgePx: 1200,
    accept: 'image/png,image/jpeg,image/webp',
  },
  cover: {
    kind: 'cover',
    aspect: '16 / 9',
    fit: 'cover',
    maxBytes: 5 * 1024 * 1024,
    maxEdgePx: 1920,
    accept: 'image/png,image/jpeg,image/webp',
  },
  photo: {
    kind: 'photo',
    aspect: '3 / 4',
    fit: 'cover',
    maxBytes: 3 * 1024 * 1024,
    maxEdgePx: 1400,
    accept: 'image/png,image/jpeg,image/webp',
  },
}
