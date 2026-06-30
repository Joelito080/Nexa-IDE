import { MongoClient } from 'mongodb'

let client: MongoClient | null = null

export async function connect(uri: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (client) {
      await client.close()
    }
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
    await client.connect()
    return { success: true }
  } catch (err: any) {
    client = null
    return { success: false, error: err.message }
  }
}

export async function disconnect(): Promise<void> {
  if (client) {
    await client.close()
    client = null
  }
}

export async function listDatabases(): Promise<{ success: boolean; databases?: any[]; error?: string }> {
  if (!client) {
    return { success: false, error: 'Not connected' }
  }
  try {
    const adminDb = client.db('admin')
    const result = await adminDb.command({ listDatabases: 1 })
    return { success: true, databases: result.databases }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function listCollections(dbName: string): Promise<{ success: boolean; collections?: any[]; error?: string }> {
  if (!client) {
    return { success: false, error: 'Not connected' }
  }
  try {
    const db = client.db(dbName)
    const collections = await db.listCollections().toArray()
    return { success: true, collections }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
