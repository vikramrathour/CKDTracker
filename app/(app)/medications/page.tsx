'use client'

import { Header } from '@/components/layout/header'
import { DEFAULT_MEDICATIONS, DOCTOR_NAME } from '@/lib/constants/medications'

const CATEGORY_COLORS: Record<string, string> = {
  Immunosuppressant: '#2d6a4f',
  Corticosteroid: '#2d6a4f',
  Antihypertensive: '#2563eb',
  'SGLT2 Inhibitor': '#2d6a4f',
  Cholesterol: '#7c3aed',
  Other: '#6b7280',
}

export default function MedicationsPage() {
  return (
    <>
      <Header title="Medications" />
      <main className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-4">
            Current Medications — {DOCTOR_NAME}, Nephrology
          </div>

          {DEFAULT_MEDICATIONS.map((med, i) => (
            <div
              key={med.name}
              className="flex items-center gap-3 py-3"
              style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}
            >
              <div
                className="w-1 h-8 rounded-sm flex-shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[med.category] || '#6b7280' }}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">{med.name} {med.dose}</div>
                <div className="text-xs text-gray-500">{med.category} — {med.frequency}</div>
              </div>
              <div className="flex gap-1">
                {med.timeOfDay.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium"
                  >
                    {t === 'morning' ? 'AM' : 'PM'}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
            Next labs due: CBC, Creatinine, Fasting Lipid Profile — 1 month from last visit
          </div>
        </div>
      </main>
    </>
  )
}
