import 'server-only'
import { parseLabText } from '@/lib/parsing/metropolis'
import { guessLabName, mergeLabValues, type ExtractionResult } from '@/lib/parsing/extraction'
import { HttpError } from '@/lib/server/auth'
import { extractLabWithGemini, geminiConfigured, GEMINI_INLINE_MAX_BYTES } from '@/lib/server/gemini'
import { UsageLimitError } from '@/lib/server/usage'

/**
 * Shared lab-value extraction for /api/pdf/parse and /api/documents/extract.
 *
 *   PDF   → pdf-parse + regex (Metropolis patterns, the known tests only),
 *           then Gemini with the ORIGINAL PDF as inlineData (text prompt if
 *           the file is too large to inline) for every other result on the
 *           report. Regex values win for the tests both found. Without the
 *           model (not configured, quota, error) the regex result is returned
 *           as partial, so it isn't cached.
 *   image → Gemini with the photo as inlineData (no offline path).
 *
 * The caller always shows the values for review before saving.
 *
 * `beforeAi` runs immediately before every Gemini call (never for the free
 * regex path): routes pass reserveExtraction() so only real model calls count
 * against the daily quota. A UsageLimitError from it skips the model: PDFs
 * fall back to the regex result, photos get a 429.
 */

export type ExtractionMethod = 'regex' | 'gemini' | 'none'

export interface FileExtraction extends ExtractionResult {
  method: ExtractionMethod
  extractedCount: number
  /** Human-readable reason when nothing (or little) was found. */
  note?: string
  /**
   * The model was wanted but skipped or failed (quota, not configured,
   * transient error): the result may improve on retry, so don't cache it.
   */
  partial?: boolean
}

export interface ExtractOptions {
  /** Called right before each Gemini call; throw UsageLimitError to skip it. */
  beforeAi?: () => Promise<void>
  /** Epoch ms by which the model must have answered (the route's time budget). */
  deadline?: number
}

export function sniffContentType(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(buf.subarray(8, 12).toString('latin1'))) {
    return 'image/heic'
  }
  return null
}

async function pdfText(buf: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    // Pass a plain Uint8Array copy, never the Buffer: pdf-parse's bundled
    // pdf.js clones its input with the value's constructor, and on current
    // Node a (pooled) Buffer comes back with shifted offsets, so every PDF
    // fails with "bad XRef entry".
    return (await pdfParse(new Uint8Array(buf) as unknown as Buffer)).text || ''
  } catch {
    return ''
  }
}

function done(r: ExtractionResult, method: ExtractionMethod, note?: string, partial = false): FileExtraction {
  return {
    ...r,
    method: r.values.length ? method : 'none',
    extractedCount: r.values.length,
    note,
    ...(partial ? { partial: true } : {}),
  }
}

export async function extractLabValues(
  buf: Buffer,
  declaredType?: string | null,
  opts: ExtractOptions = {}
): Promise<FileExtraction> {
  const type = sniffContentType(buf)
  if (!type) throw new HttpError(415, 'Unsupported file: upload a PDF or a JPEG/PNG/WebP/HEIC photo')
  if (declaredType && declaredType !== type && !(declaredType === 'image/heif' && type === 'image/heic')) {
    throw new HttpError(415, 'File content does not match its type')
  }

  if (type === 'application/pdf') {
    const text = await pdfText(buf)
    const regex = text.trim().length >= 50 ? parseLabText(text) : { values: [], date: null }
    const regexResult: ExtractionResult = { ...regex, labName: guessLabName(text) }

    if (!geminiConfigured()) {
      return done(regexResult, 'regex', 'AI extraction is not configured, so only the common tests were read', true)
    }
    const aiInput =
      buf.length <= GEMINI_INLINE_MAX_BYTES
        ? { data: buf, mimeType: type }
        : text.trim().length >= 50
          ? { text }
          : null
    if (aiInput) {
      try {
        await opts.beforeAi?.()
      } catch (err) {
        if (err instanceof UsageLimitError) {
          return done(regexResult, 'regex', `${err.message} Only the common tests were read.`, true)
        }
        throw err
      }
      try {
        const ai = await extractLabWithGemini(aiInput, { deadline: opts.deadline })
        // The parser is exact for the tests it knows; the model adds the rest.
        const values = mergeLabValues(regex.values, ai.values)
        if (values.length > regex.values.length) {
          return done({ values, date: regex.date || ai.date, labName: regexResult.labName || ai.labName }, 'gemini')
        }
      } catch (err) {
        console.error('Gemini extraction failed:', err instanceof Error ? err.message.slice(0, 200) : 'unknown error')
        return done(
          regexResult,
          'regex',
          regex.values.length
            ? 'The AI reader is busy, so only the common tests were read. Try again to read the rest.'
            : 'The AI reader is busy, so this report could not be read. Try again in a minute.',
          true
        )
      }
    }
    return done(regexResult, 'regex', regex.values.length ? undefined : 'No lab values found in this PDF')
  }

  // Images: model only.
  if (!geminiConfigured()) throw new HttpError(503, 'Reading photos needs AI extraction, which is not configured')
  if (buf.length > GEMINI_INLINE_MAX_BYTES) throw new HttpError(413, 'Photo too large to read (max 14 MB)')
  try {
    await opts.beforeAi?.()
  } catch (err) {
    if (err instanceof UsageLimitError) throw new HttpError(429, err.message)
    throw err
  }
  try {
    const ai = await extractLabWithGemini({ data: buf, mimeType: type }, { deadline: opts.deadline })
    return done(ai, 'gemini', ai.values.length ? undefined : 'No lab values found in this photo')
  } catch (err) {
    console.error('Gemini extraction failed:', err instanceof Error ? err.message.slice(0, 200) : 'unknown error')
    throw new HttpError(502, 'Could not read this photo. Try again or enter the values manually.')
  }
}
