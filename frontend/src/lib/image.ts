/**
 * Utilidades para incrustar imágenes en notas como data URI (base64).
 *
 * Las imágenes pegadas/soltadas se comprimen y reescalan en el cliente antes de
 * guardarse dentro del HTML de la nota, para no inflar la base de datos.
 */

/** Lado mayor máximo (px) al que se reescala la imagen antes de incrustarla. */
const MAX_DIMENSION = 1280
/** Calidad de exportación JPEG (0-1). */
const JPEG_QUALITY = 0.8

/**
 * Comprime y reescala un fichero de imagen, devolviendo un data URI listo para
 * usar como `src` de un `<img>`.
 *
 * @param file - Fichero de imagen (de un evento paste o drop).
 * @returns Promesa con el data URI (`data:image/...;base64,...`).
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_DIMENSION)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Sin canvas disponible: caemos al fichero original en base64.
      return await fileToDataUrl(file)
    }
    ctx.drawImage(img, 0, 0, width, height)

    // PNG conserva transparencia; el resto se exporta como JPEG para reducir tamaño.
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    return canvas.toDataURL(mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined)
  } catch {
    return await fileToDataUrl(file)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Extrae los ficheros de imagen de un DataTransfer/Clipboard (paste o drop). */
export function getImageFiles(items: DataTransferItemList | null, files: FileList | null): File[] {
  const result: File[] = []
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) result.push(f)
      }
    }
  }
  if (result.length === 0 && files) {
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) result.push(f)
    }
  }
  return result
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  const ratio = w > h ? max / w : max / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
