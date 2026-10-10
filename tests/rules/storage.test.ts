import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteObject, getMetadata, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'
import { ALICE, BOB, CAROL, MALLORY, PID, createEnv, seedCircle } from './setup'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv({ storage: true })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await seedCircle(env)
})

const storageAs = (uid: string) => env.authenticatedContext(uid).storage() as unknown as FirebaseStorage
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"
const docPath = (file = 'report.pdf', docId = 'd1', pid = PID) => `patients/${pid}/documents/${docId}/${file}`

/**
 * The vault writes Firestore metadata FIRST (lib/firebase/storage.ts), and the
 * storage rules only accept an upload matching it. Seed that metadata doc.
 */
async function seedMeta(docId: string, fileName: string, contentType = 'application/pdf', pid = PID) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'patients', pid, 'documents', docId), {
      kind: 'lab-report',
      fileName,
      storagePath: `patients/${pid}/documents/${docId}/${fileName}`,
      contentType,
      size: PDF.length,
      createdBy: BOB,
    })
  })
}

async function seedFile(path: string, contentType = 'application/pdf') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage() as unknown as FirebaseStorage, path), PDF, { contentType })
  })
}

describe('document vault uploads', () => {
  it('owner and editor can upload PDFs and images matching their metadata', async () => {
    await seedMeta('d1', 'a.pdf')
    await assertSucceeds(uploadBytes(ref(storageAs(ALICE), docPath('a.pdf', 'd1')), PDF, { contentType: 'application/pdf' }))
    const types = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    for (let i = 0; i < types.length; i++) {
      await seedMeta(`d${i + 2}`, `p${i}`, types[i])
      await assertSucceeds(uploadBytes(ref(storageAs(BOB), docPath(`p${i}`, `d${i + 2}`)), PDF, { contentType: types[i] }))
    }
  })

  it('viewers and strangers cannot upload', async () => {
    await seedMeta('d1', 'report.pdf')
    await assertFails(uploadBytes(ref(storageAs(CAROL), docPath()), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storageAs(MALLORY), docPath()), PDF, { contentType: 'application/pdf' }))
  })

  it('an upload without its metadata doc is rejected (no orphan files)', async () => {
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('orphan.pdf', 'nometa')), PDF, { contentType: 'application/pdf' }))
  })

  it('the path must equal the metadata storagePath', async () => {
    await seedMeta('d1', 'report.pdf')
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('other.pdf', 'd1')), PDF, { contentType: 'application/pdf' }))
    // d2 has no metadata even though d1 does
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('report.pdf', 'd2')), PDF, { contentType: 'application/pdf' }))
  })

  it('rejects other content types, parameters, and a type that differs from the metadata', async () => {
    await seedMeta('d1', 'x', 'application/pdf')
    for (const type of ['text/html', 'application/javascript', 'image/svg+xml', 'application/octet-stream', 'application/pdf; x=1', 'application/pdfx']) {
      await assertFails(uploadBytes(ref(storageAs(BOB), docPath('x', 'd1')), PDF, { contentType: type }))
    }
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('x', 'd1')), PDF, { contentType: 'image/png' }))
    await assertSucceeds(uploadBytes(ref(storageAs(BOB), docPath('x', 'd1')), PDF, { contentType: 'application/pdf' }))
  })

  it('rejects files of 20 MB or more', async () => {
    await seedMeta('d1', 'big.pdf')
    const big = new Uint8Array(20 * 1024 * 1024)
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('big.pdf')), big, { contentType: 'application/pdf' }))
  })

  it('files are immutable (no overwrite), editors can delete, viewers cannot', async () => {
    await seedMeta('d1', 'report.pdf')
    await seedFile(docPath())
    await assertFails(uploadBytes(ref(storageAs(ALICE), docPath()), PDF, { contentType: 'application/pdf' }))
    await assertFails(deleteObject(ref(storageAs(CAROL), docPath())))
    await assertSucceeds(deleteObject(ref(storageAs(BOB), docPath())))
  })

  it('uploading into another patient\'s vault fails', async () => {
    const other = `${MALLORY}_abcdef12`
    await seedMeta('d1', 'a.pdf', 'application/pdf', other)
    await assertFails(uploadBytes(ref(storageAs(ALICE), docPath('a.pdf', 'd1', other)), PDF, { contentType: 'application/pdf' }))
  })
})

describe('document vault reads', () => {
  beforeEach(() => seedFile(docPath()))

  it('every member can read', async () => {
    for (const uid of [ALICE, BOB, CAROL]) await assertSucceeds(getMetadata(ref(storageAs(uid), docPath())))
  })

  it('strangers and anonymous users cannot', async () => {
    await assertFails(getMetadata(ref(storageAs(MALLORY), docPath())))
    const anon = env.unauthenticatedContext().storage() as unknown as FirebaseStorage
    await assertFails(getMetadata(ref(anon, docPath())))
  })
})

describe('legacy lab-pdfs', () => {
  beforeEach(() => seedFile(`lab-pdfs/${ALICE}/1700000000000-old.pdf`))

  it('owner can still read their legacy uploads; others cannot', async () => {
    await assertSucceeds(getMetadata(ref(storageAs(ALICE), `lab-pdfs/${ALICE}/1700000000000-old.pdf`)))
    await assertFails(getMetadata(ref(storageAs(BOB), `lab-pdfs/${ALICE}/1700000000000-old.pdf`)))
  })

  it('legacy path is read-only', async () => {
    await assertFails(uploadBytes(ref(storageAs(ALICE), `lab-pdfs/${ALICE}/new.pdf`), PDF, { contentType: 'application/pdf' }))
    await assertFails(deleteObject(ref(storageAs(ALICE), `lab-pdfs/${ALICE}/1700000000000-old.pdf`)))
  })
})
