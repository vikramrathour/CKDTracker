import { NextRequest, NextResponse } from 'next/server'
import { REFERENCE_RANGES } from '@/lib/constants/reference-ranges'
import type { LabValue, Panel } from '@/lib/types/lab-record'

// Metropolis Healthcare regex patterns for extracting lab values
const METROPOLIS_PATTERNS: Record<string, { pattern: RegExp; panel: Panel; unit: string }> = {
  'Hemoglobin': { pattern: /Haemoglobin\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: 'g/dL' },
  'RBC Count': { pattern: /R\.?B\.?C\.?\s*Count\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: 'million/µL' },
  'WBC Count': { pattern: /(?:W\.?B\.?C\.?\s*Count|Total\s+(?:Leucocyte|WBC)\s*Count)\s*[:\-]?\s*([\d,]+)/i, panel: 'hemogram', unit: '/µL' },
  'Platelet Count': { pattern: /Platelet\s*Count\s*[:\-]?\s*([\d,]+)/i, panel: 'hemogram', unit: '/µL' },
  'PCV/Hematocrit': { pattern: /(?:PCV|Haematocrit|HCT)\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: '%' },
  'MCV': { pattern: /MCV\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: 'fL' },
  'MCH': { pattern: /MCH(?!\s*C)\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: 'pg' },
  'MCHC': { pattern: /MCHC\s*[:\-]?\s*([\d.]+)/i, panel: 'hemogram', unit: 'g/dL' },
  'Creatinine': { pattern: /(?:Serum\s+)?Creatinine\s*[:\-]?\s*([\d.]+)/i, panel: 'kidney', unit: 'mg/dL' },
  'eGFR': { pattern: /(?:eGFR|GFR|Glomerular\s+Filtration)\s*[:\-]?\s*([\d.]+)/i, panel: 'kidney', unit: 'mL/min/1.73m²' },
  'BUN': { pattern: /(?:BUN|Blood\s+Urea\s+Nitrogen)\s*[:\-]?\s*([\d.]+)/i, panel: 'kidney', unit: 'mg/dL' },
  'Uric Acid': { pattern: /Uric\s+Acid\s*[:\-]?\s*([\d.]+)/i, panel: 'kidney', unit: 'mg/dL' },
  'Tacrolimus': { pattern: /Tacrolimus\s*[:\-]?\s*([\d.]+)/i, panel: 'tacrolimus', unit: 'ng/mL' },
  'Sodium': { pattern: /Sodium\s*(?:\(Na\+?\))?\s*[:\-]?\s*([\d.]+)/i, panel: 'electrolytes', unit: 'mEq/L' },
  'Potassium': { pattern: /Potassium\s*(?:\(K\+?\))?\s*[:\-]?\s*([\d.]+)/i, panel: 'electrolytes', unit: 'mEq/L' },
  'Chloride': { pattern: /Chloride\s*(?:\(Cl\-?\))?\s*[:\-]?\s*([\d.]+)/i, panel: 'electrolytes', unit: 'mEq/L' },
  'Calcium': { pattern: /(?:Serum\s+)?Calcium\s*[:\-]?\s*([\d.]+)/i, panel: 'electrolytes', unit: 'mg/dL' },
  'Phosphorus': { pattern: /Phosphorus\s*[:\-]?\s*([\d.]+)/i, panel: 'electrolytes', unit: 'mg/dL' },
  'Total Cholesterol': { pattern: /Total\s+Cholesterol\s*[:\-]?\s*([\d.]+)/i, panel: 'lipid', unit: 'mg/dL' },
  'Triglycerides': { pattern: /Triglycerides?\s*[:\-]?\s*([\d.]+)/i, panel: 'lipid', unit: 'mg/dL' },
  'HDL Cholesterol': { pattern: /HDL\s*(?:Cholesterol)?\s*[:\-]?\s*([\d.]+)/i, panel: 'lipid', unit: 'mg/dL' },
  'LDL Cholesterol': { pattern: /LDL\s*(?:Cholesterol)?\s*[:\-]?\s*([\d.]+)/i, panel: 'lipid', unit: 'mg/dL' },
  'VLDL Cholesterol': { pattern: /VLDL\s*(?:Cholesterol)?\s*[:\-]?\s*([\d.]+)/i, panel: 'lipid', unit: 'mg/dL' },
}

// Try to extract date from Metropolis PDF text
function extractDate(text: string): string | null {
  // Look for patterns like "11/09/2024", "11-Sep-2024", "2024-09-11"
  const patterns = [
    /(?:Collection|Sample|Report)\s*Date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-]\d{2,4})/i,
    /(\d{4}-\d{2}-\d{2})/,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const dateStr = match[1]
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
      }
      // Try DD/MM/YYYY
      const parts = dateStr.split(/[\/\-]/)
      if (parts.length === 3) {
        const [d, m, y] = parts
        const year = y.length === 2 ? '20' + y : y
        const date = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
      }
    }
  }
  return null
}

function parseWithRegex(text: string): { values: LabValue[]; date: string | null } {
  const values: LabValue[] = []

  for (const [testName, config] of Object.entries(METROPOLIS_PATTERNS)) {
    const match = text.match(config.pattern)
    if (match) {
      const rawVal = match[1].replace(/,/g, '')
      const numVal = parseFloat(rawVal)
      if (!isNaN(numVal)) {
        const ref = REFERENCE_RANGES[testName]
        values.push({
          testName,
          panel: config.panel,
          value: numVal,
          unit: config.unit,
          referenceMin: ref?.min,
          referenceMax: ref?.max,
          isAbnormal: ref ? (numVal < ref.min || numVal > ref.max) : false,
        })
      }
    }
  }

  return { values, date: extractDate(text) }
}

async function parseWithGemini(text: string): Promise<{ values: LabValue[]; date: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const prompt = `Extract lab test values from this medical report text. Return a JSON array of objects with these fields:
- testName: the standardized test name (use exactly these names: ${Object.keys(REFERENCE_RANGES).join(', ')})
- value: the numeric value
- unit: the unit of measurement

Also extract the report date if present.

Return ONLY valid JSON in this format: {"date": "YYYY-MM-DD" or null, "values": [...]}

Report text:
${text.substring(0, 4000)}`

  const result = await model.generateContent(prompt)
  const response = result.response.text()

  // Extract JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { values: [], date: null }

  const parsed = JSON.parse(jsonMatch[0])
  const values: LabValue[] = []

  for (const item of parsed.values || []) {
    const ref = REFERENCE_RANGES[item.testName]
    if (ref && typeof item.value === 'number') {
      values.push({
        testName: item.testName,
        panel: ref.panel,
        value: item.value,
        unit: item.unit || ref.unit,
        referenceMin: ref.min,
        referenceMax: ref.max,
        isAbnormal: item.value < ref.min || item.value > ref.max,
      })
    }
  }

  return { values, date: parsed.date || null }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Extract text from PDF
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfParse = (await import('pdf-parse')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 400 })
    }

    // Try regex first (fast, works for Metropolis format)
    let result = parseWithRegex(text)

    // If regex found fewer than 3 values, try Gemini AI fallback
    if (result.values.length < 3) {
      try {
        const aiResult = await parseWithGemini(text)
        if (aiResult.values.length > result.values.length) {
          result = aiResult
        }
      } catch (err) {
        console.error('Gemini parsing failed, using regex results:', err)
      }
    }

    return NextResponse.json({
      values: result.values,
      date: result.date,
      labName: text.toLowerCase().includes('metropolis') ? 'Metropolis Healthcare' : 'Unknown Lab',
      extractedCount: result.values.length,
      totalText: text.length,
    })
  } catch (err) {
    console.error('PDF parse error:', err)
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 })
  }
}
