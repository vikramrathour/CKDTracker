import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getStorageInstance } from './config'

export async function uploadPDF(uid: string, file: File): Promise<string> {
  const storage = await getStorageInstance()
  const timestamp = Date.now()
  const path = `lab-pdfs/${uid}/${timestamp}-${file.name}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return path
}

export async function getPDFUrl(path: string): Promise<string> {
  const storage = await getStorageInstance()
  const storageRef = ref(storage, path)
  return getDownloadURL(storageRef)
}
