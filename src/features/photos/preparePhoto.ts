import { newId } from '../../models/id'
import type { Photo } from '../../models/types'

/** Grand côté maximal à l'import : très lisible, et quelques centaines de Ko au lieu de plusieurs Mo. */
export const COTE_MAX = 2560
const COTE_MINIATURE = 320

async function redimensionner(source: ImageBitmap, coteMax: number, qualite: number) {
  const ratio = Math.min(1, coteMax / Math.max(source.width, source.height))
  const width = Math.round(source.width * ratio)
  const height = Math.round(source.height * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', qualite),
  )
  return { blob, width, height }
}

/** Transforme le fichier de l'appareil photo ou de la galerie en photo prête à stocker. */
export async function preparePhoto(file: File): Promise<Photo> {
  // 'from-image' applique l'orientation EXIF : la photo s'affiche dans le bon sens.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const image = await redimensionner(bitmap, COTE_MAX, 0.88)
    const miniature = await redimensionner(bitmap, COTE_MINIATURE, 0.7)
    const now = Date.now()
    return {
      id: newId(),
      blob: image.blob,
      thumb: miniature.blob,
      width: image.width,
      height: image.height,
      createdAt: now,
      updatedAt: now,
    }
  } finally {
    bitmap.close()
  }
}
