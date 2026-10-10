import { PERSONAL_DATA } from '@/lib/personal/sample'

/**
 * Synthetic demo records (never real patient data). Written to Firestore only
 * when the user clicks "Load demo data" on the dashboard and
 * NEXT_PUBLIC_ENABLE_DEMO=1. Client code must never import the personal-data alias.
 */
export const SEED_RECORDS = PERSONAL_DATA.seedRecords
