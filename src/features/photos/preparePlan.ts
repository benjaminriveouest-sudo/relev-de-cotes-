import { newId } from '../../models/id'
import type { Photo } from '../../models/types'
import { COTE_MINIATURE, redimensionner } from './preparePhoto'

/** Grand côté d'un plan : plus que pour une photo, pour lire les petits textes en zoomant. */
const COTE_PLAN = 4096

/**
 * Transforme chaque page d'un PDF en image à coter, comme une photo.
 * Les pages sont traitées une à une : un gros plan ne tient pas en mémoire d'un coup sur un téléphone.
 */
export async function preparePlan(
  file: File,
  ouvrageId: string,
  surPage: (photo: Photo, numero: number, total: number) => Promise<void>,
): Promise<void> {
  // pdf.js n'est chargé qu'au premier plan importé : l'appli reste légère au démarrage.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: urlWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker

  const ressources = `${import.meta.env.BASE_URL}pdfjs/`
  const tache = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: `${ressources}wasm/`,
    standardFontDataUrl: `${ressources}standard_fonts/`,
  })
  try {
    const pdf = await tache.promise
    const debut = Date.now()
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const page = await pdf.getPage(numero)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: COTE_PLAN / Math.max(base.width, base.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const image = await redimensionner(canvas, COTE_PLAN, 0.9)
      const miniature = await redimensionner(canvas, COTE_MINIATURE, 0.7)
      // Libère tout de suite la mémoire du canvas (important sur iPhone).
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      await surPage(
        {
          id: newId(),
          ouvrageId,
          blob: image.blob,
          thumb: miniature.blob,
          width: image.width,
          height: image.height,
          plan: true,
          // Une date par page : le PDF de sortie les garde dans l'ordre du plan.
          createdAt: debut + numero,
          updatedAt: debut + numero,
        },
        numero,
        pdf.numPages,
      )
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new Error('ce PDF est protégé par un mot de passe')
    throw e
  } finally {
    await tache.destroy()
  }
}
