import type { MediaConstraints } from './types'

const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp'])

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagen inválida'))
    img.src = src
  })
}

/** Resize/compress raster images. SVG and already-small files pass through. */
export async function prepareImageFile(
  file: File,
  constraints: MediaConstraints,
): Promise<File> {
  if (file.type === 'image/svg+xml') {
    if (!constraints.allowSvg) throw new Error('SVG no permitido para este tipo de imagen')
    if (file.size > constraints.maxBytes) throw new Error('El archivo supera el tamaño máximo')
    return file
  }

  if (!RASTER.has(file.type)) {
    throw new Error('Formato no soportado. Usa PNG, JPG o WebP.')
  }
  if (file.size > constraints.maxBytes * 2) {
    throw new Error(
      `El archivo es demasiado grande (máx. ${Math.round(constraints.maxBytes / 1024 / 1024)} MB).`,
    )
  }

  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, constraints.maxEdgePx / Math.max(img.width, img.height))
  if (scale >= 1 && file.size <= constraints.maxBytes) return file

  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, w, h)

  const preferPng = file.type === 'image/png' || constraints.kind === 'logo'
  const mime = preferPng ? 'image/png' : 'image/jpeg'
  const quality = preferPng ? undefined : 0.85

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  )
  if (!blob) return file
  if (blob.size > constraints.maxBytes) {
    throw new Error('No se pudo comprimir la imagen bajo el límite permitido')
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() })
}

export function validateImageFile(file: File, constraints: MediaConstraints) {
  const allowed = constraints.accept.split(',').map((s) => s.trim())
  if (!allowed.includes(file.type)) {
    throw new Error('Formato no permitido')
  }
  if (file.size > constraints.maxBytes * 1.5) {
    throw new Error(
      `Máximo ${Math.round(constraints.maxBytes / 1024 / 1024)} MB aproximadamente`,
    )
  }
}
