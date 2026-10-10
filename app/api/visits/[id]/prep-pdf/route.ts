import { NextRequest, NextResponse } from 'next/server'
import { requireMember, errorResponse, HttpError } from '@/lib/server/auth'
import { loadPatientCore } from '@/lib/server/patient-data'
import { renderVisitPrepPdf } from '@/lib/server/pdf/visit-prep-pdf'
import { buildVisitPrep, visitAlerts } from '@/lib/visits/prep'
import { toTargetMap } from '@/lib/calculations/targets'
import { contentDisposition, exportSlug, fileDate } from '@/lib/export/build'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Visit-prep PDF for patients/{pid}/visits/{id} (any member).
 *   GET  /api/visits/{id}/prep-pdf?pid=…
 *   POST /api/visits/{id}/prep-pdf   { pid }
 * The summary is built by the same pure builder as the on-screen prep page.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

async function handle(req: NextRequest, visitId: string, pid: string) {
  if (!ID_RE.test(visitId)) throw new HttpError(400, 'Invalid visit id')
  await requireMember(req, pid, 'viewer')

  const data = await loadPatientCore(pid)
  const visit = data.visits.find((v) => v.id === visitId)
  if (!visit) throw new HttpError(404, 'Visit not found')

  const summary = buildVisitPrep({
    visit,
    visits: data.visits,
    records: data.records,
    medications: data.medications,
    questions: data.questions,
    targets: toTargetMap(data.targets),
    alerts: visitAlerts(data.records, visit.visitDate, data.targets, data.alertRules),
  })
  const patientName = (data.patient?.displayName as string | undefined) || 'Patient'
  const pdf = await renderVisitPrepPdf({ summary, patientName })

  // visitDate is client-written: only a plain YYYY-MM-DD goes into the header.
  const fileName = `visit-prep-${exportSlug(patientName)}-${fileDate(visit.visitDate)}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(fileName),
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    return await handle(req, id, req.nextUrl.searchParams.get('pid') || '')
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as { pid?: unknown } | null
    return await handle(req, id, typeof body?.pid === 'string' ? body.pid : '')
  } catch (err) {
    return errorResponse(err)
  }
}
