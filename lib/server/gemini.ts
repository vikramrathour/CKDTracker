import 'server-only'
import { GoogleGenAI, createPartFromBase64, type Schema } from '@google/genai'
import {
  EXTRACTION_INSTRUCTIONS,
  EXTRACTION_SCHEMA,
  parseExtractionText,
  type ExtractionResult,
} from '@/lib/parsing/extraction'

/**
 * Must point at a billing-enabled (paid) project: free-tier Gemini API traffic
 * may be used for model training, which is not acceptable for medical data.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

let client: GoogleGenAI | null = null

export function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY
}

/** MIME types Gemini accepts as inline document/image input. */
export const GEMINI_INLINE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

/** Inline request payloads are capped at 20 MB in total; keep headroom for base64. */
export const GEMINI_INLINE_MAX_BYTES = 14 * 1024 * 1024

/**
 * Structured lab-value extraction with Gemini, from either report text or the
 * original file (PDF/photo sent as inlineData). The response schema limits
 * test names to REFERENCE_RANGES keys and the result is re-validated.
 * Never logs the content or the values.
 */
export async function extractLabWithGemini(
  input: { text: string } | { data: Buffer; mimeType: string }
): Promise<ExtractionResult> {
  const ai = getGemini()
  const contents =
    'text' in input
      ? `${EXTRACTION_INSTRUCTIONS}\n\nReport text:\n${input.text.substring(0, 12000)}`
      : [
          {
            role: 'user',
            parts: [createPartFromBase64(input.data.toString('base64'), input.mimeType), { text: EXTRACTION_INSTRUCTIONS }],
          },
        ]

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA as unknown as Schema,
      temperature: 0,
    },
  })
  return parseExtractionText(response.text)
}
