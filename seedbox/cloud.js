// Cloud storage (Cloudflare R2 or any S3-compatible service).
// Finished downloads are uploaded here and streamed back through short-lived
// signed URLs, so files stay available even when this server is off.
import fs from 'node:fs'
import path from 'node:path'
import {
  S3Client, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = 'seedbox-files', S3_ENDPOINT,
} = process.env

const endpoint = S3_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')

export const cloudEnabled = !!(endpoint && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
export const bucket = R2_BUCKET

const s3 = cloudEnabled
  ? new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: !!S3_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null

const toKey = p => p.split(path.sep).join('/')

export async function uploadFile (localPath, key, contentType, onProgress) {
  const upload = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: toKey(key), Body: fs.createReadStream(localPath), ContentType: contentType },
    partSize: 16 * 1024 * 1024,
    queueSize: 4,
  })
  upload.on('httpUploadProgress', p => onProgress?.(p.loaded || 0))
  await upload.done()
}

// One folder level at a time, like a file browser.
export async function list (prefix = '') {
  const folders = []
  const files = []
  let token
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/', ContinuationToken: token }))
    for (const p of r.CommonPrefixes || []) folders.push(p.Prefix)
    for (const o of r.Contents || []) if (o.Key !== prefix) files.push({ key: o.Key, size: o.Size, mtime: +o.LastModified })
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return { folders, files }
}

export async function usage () {
  let bytes = 0
  let count = 0
  let token
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    for (const o of r.Contents || []) { bytes += o.Size; count++ }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return { bytes, count }
}

// Deletes one object, or everything under a folder prefix ending in "/".
export async function remove (key) {
  const keys = []
  if (key.endsWith('/')) {
    let token
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: key, ContinuationToken: token }))
      for (const o of r.Contents || []) keys.push(o.Key)
      token = r.IsTruncated ? r.NextContinuationToken : undefined
    } while (token)
  } else {
    keys.push(key)
  }
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) } }))
  }
  return keys.length
}

export function signedUrl (key, { download = false, contentType } = {}) {
  const name = key.split('/').pop()
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  }), { expiresIn: 12 * 60 * 60 })
}
