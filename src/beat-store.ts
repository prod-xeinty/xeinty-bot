export type StoredBeat = {
  id: string
  createdAt: number
  title: string
  bpm: string
  key: string
  tags: string
  status: string
  audioName?: string
  telegramCaption: string
  youtubeDescription: string
  youtubeKeywords: string
  telegramLink: string
  youtubeLink: string
}

type StoredFiles = { id: string; audioFile?: File; coverFile?: File }

const DB_NAME = 'xeinty-beats'
const DB_VERSION = 1
let dbPromise: Promise<IDBDatabase> | undefined

function database(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('beats')) db.createObjectStore('beats', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return dbPromise
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error)
  })
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function loadStoredBeats(): Promise<{ beat: StoredBeat; files?: StoredFiles }[]> {
  const db = await database()
  const transaction = db.transaction(['beats', 'files'], 'readonly')
  const finished = completed(transaction)
  const [beats, files] = await Promise.all([
    request(transaction.objectStore('beats').getAll() as IDBRequest<StoredBeat[]>),
    request(transaction.objectStore('files').getAll() as IDBRequest<StoredFiles[]>),
  ])
  await finished
  const byId = new Map(files.map((item) => [item.id, item]))
  return beats.sort((a, b) => b.createdAt - a.createdAt).map((beat) => ({ beat, files: byId.get(beat.id) }))
}

export async function saveNewBeat(beat: StoredBeat, files: Omit<StoredFiles, 'id'>): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['beats', 'files'], 'readwrite')
  const finished = completed(transaction)
  transaction.objectStore('beats').put(beat)
  transaction.objectStore('files').put({ id: beat.id, ...files })
  await finished
}

export async function saveBeatMetadata(beat: StoredBeat): Promise<void> {
  const db = await database()
  const transaction = db.transaction('beats', 'readwrite')
  const finished = completed(transaction)
  transaction.objectStore('beats').put(beat)
  await finished
}

export async function deleteStoredBeat(id: string): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['beats', 'files'], 'readwrite')
  const finished = completed(transaction)
  transaction.objectStore('beats').delete(id)
  transaction.objectStore('files').delete(id)
  await finished
}
