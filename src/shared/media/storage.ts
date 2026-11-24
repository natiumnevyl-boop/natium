import { supabase } from '@/lib/supabase'
import { AppError, toAppError } from '@/lib/errors'
import type { MediaBucket } from './types'

const PUBLIC_BUCKETS = new Set<MediaBucket>(['org-assets', 'competition-assets'])

export function isPublicBucket(bucket: MediaBucket) {
  return PUBLIC_BUCKETS.has(bucket)
}

export function publicObjectUrl(bucket: MediaBucket, path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

export async function createSignedMediaUrl(
  bucket: MediaBucket,
  path: string,
  expiresIn = 60 * 60,
): Promise<string> {
  if (isPublicBucket(bucket)) return publicObjectUrl(bucket, path)
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw toAppError(error)
  return data.signedUrl
}

export async function uploadMediaObject(opts: {
  bucket: MediaBucket
  folderId: string
  file: File
  previousPath?: string | null
}): Promise<{ path: string; url: string }> {
  const ext =
    opts.file.type === 'image/svg+xml'
      ? 'svg'
      : opts.file.type === 'image/png'
        ? 'png'
        : opts.file.type === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `${opts.folderId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(opts.bucket).upload(path, opts.file, {
    upsert: false,
    contentType: opts.file.type,
    cacheControl: '3600',
  })
  if (error) throw toAppError(error)

  if (opts.previousPath && opts.previousPath !== path) {
    await supabase.storage.from(opts.bucket).remove([opts.previousPath]).catch(() => undefined)
  }

  const url = isPublicBucket(opts.bucket)
    ? publicObjectUrl(opts.bucket, path)
    : await createSignedMediaUrl(opts.bucket, path)

  return { path, url }
}

export async function removeMediaObject(bucket: MediaBucket, path: string | null | undefined) {
  if (!path) return
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw toAppError(error)
}

export async function resolveMediaUrl(
  bucket: MediaBucket,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  try {
    return await createSignedMediaUrl(bucket, path)
  } catch (err) {
    throw err instanceof AppError ? err : toAppError(err)
  }
}
