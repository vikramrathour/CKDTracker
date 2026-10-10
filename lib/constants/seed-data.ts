import { PERSONAL_DATA } from '@personal-data'

/**
 * Records written to Firestore on first login (see use-lab-records.ts).
 * Real data lives in the gitignored lib/personal/local.ts; synthetic fallback in sample.ts.
 */
export const SEED_RECORDS = PERSONAL_DATA.seedRecords
