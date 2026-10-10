import { NextRequest, NextResponse } from 'next/server'
import { requireMember, errorResponse, HttpError } from '@/lib/server/auth'
import { loadPatientCore, loadVitalsAndDocuments } from '@/lib/server/patient-data'
import { buildFullExport, buildLabCsv, contentDisposition, exportSlug } from '@/lib/export/build'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/export?pid=…&format=csv|json   (any member, viewer and up)
 *   csv  → one row per lab value (lab range + the patient's target)
 *   json → full data export (profile, records, medications + dose history,
 *          visits, questions, targets, vitals, document metadata; no files)
 */
export async function GET(req: NextRequest) {
  try {
    const pid = req.nextUrl.searchParams.get('pid') || ''
    const format = (req.nextUrl.searchParams.get('format') || 'csv').toLowerCase()
    if (format !== 'csv' && format !== 'json') throw new HttpError(400, 'format must be csv or json')
    await requireMember(req, pid, 'viewer')

    const today = new Date().toISOString().slice(0, 10)
    const headers = new Headers({ 'Cache-Control': 'private, no-store' })

    if (format === 'csv') {
      const { records, patient, targets } = await loadPatientCore(pid)
      const name = `${exportSlug(patient?.displayName as string | undefined)}-labs-${today}.csv`
      headers.set('Content-Type', 'text/csv; charset=utf-8')
      headers.set('Content-Disposition', contentDisposition(name))
      // BOM so Excel opens µ/² correctly
      return new NextResponse(String.fromCharCode(0xfeff) + buildLabCsv(records, targets), { headers })
    }

    const [core, extra] = await Promise.all([loadPatientCore(pid, { doseHistory: true }), loadVitalsAndDocuments(pid)])
    const body = buildFullExport({
      patient: core.patient,
      records: core.records,
      medications: core.medications,
      visits: core.visits,
      questions: core.questions,
      targets: core.targets,
      vitals: extra.vitals,
      documents: extra.documents,
    })
    const name = `${exportSlug(core.patient?.displayName as string | undefined)}-export-${today}.json`
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Content-Disposition', contentDisposition(name))
    return new NextResponse(JSON.stringify(body, null, 2), { headers })
  } catch (err) {
    return errorResponse(err)
  }
}
