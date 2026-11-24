import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/utils/cn'
import { prepareImageFile, validateImageFile } from './compress'
import { MEDIA_PRESETS, type MediaBucket, type MediaKind } from './types'
import { removeMediaObject, resolveMediaUrl, uploadMediaObject } from './storage'

interface ImageUploadProps {
  kind: MediaKind
  bucket: MediaBucket
  /** First path segment / ownership folder (org id, team id, user id, competition id). */
  folderId: string | undefined
  path: string | null | undefined
  onChange: (next: { path: string | null; url: string | null }) => void
  label?: string
  hint?: string
  disabled?: boolean
  className?: string
}

export function ImageUpload({
  kind,
  bucket,
  folderId,
  path,
  onChange,
  label,
  hint,
  disabled,
  className,
}: ImageUploadProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const constraints = MEDIA_PRESETS[kind]
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let active = true
    setError(null)
    if (!path) {
      setPreviewUrl(null)
      return
    }
    if (/^https?:\/\//i.test(path) || path.startsWith('blob:')) {
      setPreviewUrl(path)
      return
    }
    void resolveMediaUrl(bucket, path)
      .then((url) => {
        if (active) setPreviewUrl(url)
      })
      .catch(() => {
        if (active) setPreviewUrl(null)
      })
    return () => {
      active = false
    }
  }, [bucket, path])

  const runUpload = useCallback(
    async (file: File) => {
      if (!folderId) {
        setError('Guarda el registro primero para poder subir imágenes.')
        return
      }
      setError(null)
      setBusy(true)
      setProgress('Preparando…')
      try {
        validateImageFile(file, constraints)
        const prepared = await prepareImageFile(file, constraints)
        setProgress('Subiendo…')
        const uploaded = await uploadMediaObject({
          bucket,
          folderId,
          file: prepared,
          previousPath: path && !/^https?:\/\//i.test(path) ? path : null,
        })
        setPreviewUrl(uploaded.url)
        onChange({ path: uploaded.path, url: uploaded.url })
        setProgress(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo subir la imagen')
        setProgress(null)
      } finally {
        setBusy(false)
      }
    },
    [bucket, constraints, folderId, onChange, path],
  )

  const onFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void runUpload(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || busy) return
    onFiles(e.dataTransfer.files)
  }

  const clear = async () => {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      if (path && !/^https?:\/\//i.test(path)) {
        await removeMediaObject(bucket, path)
      }
      setPreviewUrl(null)
      onChange({ path: null, url: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <p className="text-xs font-semibold tracking-wide text-steel-600 uppercase">{label}</p>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative overflow-hidden rounded-lg border border-dashed bg-white transition-colors',
          dragging ? 'border-aqua bg-aqua-100/40' : 'border-ice-200',
          disabled && 'opacity-60',
        )}
        style={{ aspectRatio: constraints.aspect }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className={cn(
              'size-full',
              constraints.fit === 'contain' ? 'object-contain p-3' : 'object-cover',
            )}
          />
        ) : (
          <button
            type="button"
            disabled={disabled || busy || !folderId}
            onClick={() => inputRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-steel-600 hover:bg-ice/60"
          >
            <ImagePlus className="size-6 text-ocean" />
            <span className="font-semibold text-navy">Seleccionar imagen</span>
            <span className="text-xs">Arrastra aquí o elige desde tu dispositivo</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy/50 text-sm font-semibold text-white">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {progress ?? 'Procesando…'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy || !folderId}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {previewUrl ? 'Reemplazar' : 'Subir'}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => void clear()}
          >
            <Trash2 className="size-3.5" />
            Quitar
          </Button>
        )}
        {hint && <p className="text-xs text-steel-600">{hint}</p>}
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {!folderId && (
        <p className="text-xs text-steel-600">
          Guarda primero los datos básicos; después podrás subir la imagen.
        </p>
      )}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={constraints.accept}
        capture={kind === 'avatar' || kind === 'photo' ? 'environment' : undefined}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
