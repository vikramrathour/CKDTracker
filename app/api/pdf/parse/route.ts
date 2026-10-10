import { NextRequest, NextResponse } from 'next/server'
import { Type, type Schema } from '@google/genai'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import { parseLabText, toLabValue } from '@/lib/parsing/metropolis'
import { parseDateString } from '@/lib/parsing/date'
import { requireUser, errorResponse, HttpError } from '@/lib/server/auth'
import { getGemini, GEMINI_MODEL } from '@/lib/server/gemini'
import type { LabValue } from '@/lib/types/lab-record'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
// multipart overhead on top of the file itself
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024

type ParseResult = { values: LabValue[]; date: string | null }

const GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING, nullable: true, description: 'Sample collection date as YYYY-MM-DD, or null' },
    values: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          testName: { type: Type.STRING, enum: Object.keys(REFERENCE_RANGES) },
          value: { type: Type.NUMBER },
          unit: { type: Type.STRING },
        },
        required: ['testName', 'value', 'unit'],
        propertyOrdering: ['testName', 'value', 'unit'],
      },
    },
  },
  required: ['date', 'values'],
  propertyOrdering: ['date', 'values'],
}

async function parseWithGemini(text: string): Promise<ParseResult> {
  const ai = getGemini()
  const prompt = `Extract lab test results from this medical lab report text (an Indian lab; dates are DD/MM/YYYY).
Only include tests whose name maps to one of the allowed testName values. Use the numeric result, not the reference range.
Report cell counts (WBC, platelets) per µL (e.g. 7.2 x10^3/µL -> 7200).

Report text:
${text.substring(0, 8000)}`

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0,
    },
  })

  const raw = response.text
  if (!raw) return { values: [], date: null }
  const parsed = JSON.parse(raw) as { date?: unknown; values?: unknown }

  const values: LabValue[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(parsed.values) ? parsed.values : []) {
    if (!item || typeof item !== 'object') continue
    const { testName, value, unit } = item as { testName?: unknown; value?: unknown; unit?: unknown }
    // Re-validate: never trust the model to respect the enum
    if (typeof testName !== 'string' || !REFERENCE_RANGES[testName] || seen.has(testName)) continue
    if (typeof value !== 'number') continue
    const labValue = toLabValue(testName, value, typeof unit === 'string' ? unit : undefined)
    if (labValue) {
      values.push(labValue)
      seen.add(testName)
    }
  }

  const date = typeof parsed.date === 'string' ? parseDateString(parsed.date) : null
  return { values, date }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req)

    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_REQUEST_BYTES) throw new HttpError(413, 'File too large (max 10 MB)')

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'No file provided')
    if (file.size > MAX_BYTES) throw new HttpError(413, 'File too large (max 10 MB)')

    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdfType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const hasPdfMagic = buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    if (!isPdfType || !hasPdfMagic) throw new HttpError(415, 'Only PDF files are supported')

    const pdfParse = (await import('pdf-parse')).default
    let text: string
    try {
      text = (await pdfParse(buffer)).text
    } catch {
      throw new HttpError(400, 'Could not read this PDF')
    }

    if (!text || text.trim().length < 50) {
      throw new HttpError(400, 'Could not extract text from PDF (scanned image PDFs are not supported yet)')
    }

    // Regex first (fast, works for Metropolis format)
    let result = parseLabText(text)

    // Fewer than 3 values: try the Gemini structured-output fallback
    if (result.values.length < 3) {
      try {
        const aiResult = await parseWithGemini(text)
        if (aiResult.values.length > result.values.length) {
          result = { values: aiResult.values, date: result.date || aiResult.date }
        }
      } catch (err) {
        console.error('Gemini parsing failed, using regex results:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({
      values: result.values,
      date: result.date,
      labName: /metropolis/i.test(text) ? 'Metropolis Healthcare' : 'Unknown Lab',
      extractedCount: result.values.length,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
