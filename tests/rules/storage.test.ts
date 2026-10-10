import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteObject, getMetadata, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
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

async function seedFile(path: string, contentType = 'application/pdf') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage() as unknown as FirebaseStorage, path), PDF, { contentType })
  })
}

describe('document vault uploads', () => {
  it('owner and editor can upload PDFs and images', async () => {
    await assertSucceeds(uploadBytes(ref(storageAs(ALICE), docPath('a.pdf', 'd1')), PDF, { contentType: 'application/pdf' }))
    const types = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    for (let i = 0; i < types.length; i++) {
      await assertSucceeds(uploadBytes(ref(storageAs(BOB), docPath(`p${i}`, `d${i + 2}`)), PDF, { contentType: types[i] }))
    }
  })

  it('viewers and strangers cannot upload', async () => {
    await assertFails(uploadBytes(ref(storageAs(CAROL), docPath()), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storageAs(MALLORY), docPath()), PDF, { contentType: 'application/pdf' }))
  })

  it('rejects other content types', async () => {
    for (const type of ['text/html', 'application/javascript', 'image/svg+xml', 'application/octet-stream']) {
      await assertFails(uploadBytes(ref(storageAs(BOB), docPath('x')), PDF, { contentType: type }))
    }
  })

  it('rejects files of 20 MB or more', async () => {
    const big = new Uint8Array(20 * 1024 * 1024)
    await assertFails(uploadBytes(ref(storageAs(BOB), docPath('big.pdf')), big, { contentType: 'application/pdf' }))
  })

  it('files are immutable (no overwrite), editors can delete, viewers cannot', async () => {
    await seedFile(docPath())
    await assertFails(uploadBytes(ref(storageAs(ALICE), docPath()), PDF, { contentType: 'application/pdf' }))
    await assertFails(deleteObject(ref(storageAs(CAROL), docPath())))
    await assertSucceeds(deleteObject(ref(storageAs(BOB), docPath())))
  })

  it('uploading into another patient\'s vault fails', async () => {
    await assertFails(uploadBytes(ref(storageAs(ALICE), docPath('a.pdf', 'd1', `${MALLORY}_abcdef12`)), PDF, { contentType: 'application/pdf' }))
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
