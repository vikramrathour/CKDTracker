import 'server-only'
import { GoogleGenAI } from '@google/genai'

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
