import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import multer from 'multer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const PORT = Number(process.env.PORT ?? 8000)
const IOPAINT_URL = String(process.env.IOPAINT_URL ?? 'http://localhost:8080').replace(/\/$/, '')

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

function mimeFromFilename(name: string | undefined, fallback: string): string {
  const lower = (name ?? '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return fallback
}

app.post('/api/inpaint', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const imageFile = files?.image?.[0]
    const maskFile = files?.mask?.[0]

    const engine = String((req.body as Record<string, unknown>)?.engine ?? 'auto')
    if (engine !== 'auto' && engine !== 'iopaint') {
      res.status(400).json({ error: 'Only engine=auto|iopaint supported in Node server mode' })
      return
    }

    if (!imageFile || !maskFile) {
      res.status(400).json({ error: 'Missing image or mask' })
      return
    }

    const imageMime = mimeFromFilename(imageFile.originalname, imageFile.mimetype || 'image/png')
    const maskMime = mimeFromFilename(maskFile.originalname, maskFile.mimetype || 'image/png')

    const payload = {
      image: toDataUrl(imageFile.buffer, imageMime),
      mask: toDataUrl(maskFile.buffer, maskMime),
      hd_strategy: 'Crop',
      hd_strategy_crop_trigger_size: 800,
      hd_strategy_crop_margin: 128,
      hd_strategy_resize_limit: 1280
    }

    const upstream = await fetch(`${IOPAINT_URL}/api/v1/inpaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      res.status(502).json({ error: `IOPaint error: ${upstream.status}`, detail: text })
      return
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/png'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('content-type', contentType)
    const seed = upstream.headers.get('x-seed')
    if (seed) res.setHeader('x-seed', seed)
    res.send(buf)
  } catch (e) {
    res.status(500).json({ error: String(e instanceof Error ? e.message : e) })
  }
})

const webDist = path.resolve(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'))
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Lamivi server listening on http://localhost:${PORT}`)
})
