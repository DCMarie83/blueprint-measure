import { PDFDocument } from 'pdf-lib'

// Returns total page count without rendering.
export async function getPdfPageCount(arrayBuffer) {
  try {
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
    return pdf.getPageCount()
  } catch {
    throw new Error('PDF could not be read — it may be corrupted or password-protected.')
  }
}

// Extracts pages startPage..endPage (1-indexed, inclusive) into a new PDF.
// Returns Uint8Array of the new PDF.
export async function extractPageRange(sourceArrayBuffer, startPage, endPage) {
  try {
    const sourcePdf = await PDFDocument.load(sourceArrayBuffer, { ignoreEncryption: true })
    const newPdf = await PDFDocument.create()

    const indices = []
    for (let i = startPage - 1; i <= endPage - 1; i++) {
      indices.push(i)
    }

    const copiedPages = await newPdf.copyPages(sourcePdf, indices)
    for (const page of copiedPages) {
      newPdf.addPage(page)
    }

    return await newPdf.save()
  } catch (err) {
    if (err.message?.includes('password')) {
      throw new Error('PDF could not be read — it may be corrupted or password-protected.')
    }
    throw new Error(`Failed to extract pages ${startPage}-${endPage}: ${err.message}`)
  }
}

// Wraps Uint8Array as a File object for TUS upload.
export function bytesToFile(bytes, filename, type = 'application/pdf') {
  return new File([bytes], filename, { type })
}
