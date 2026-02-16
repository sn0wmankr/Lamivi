import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import express from 'express'
import multer from 'multer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const execFileAsync = promisify(execFile)

const PORT = Number(process.env.PORT ?? 8000)

const LAMA_SCRIPT = [
  'from PIL import Image',
  'from simple_lama_inpainting import SimpleLama',
  'import sys',
  'inp, msk, out = sys.argv[1], sys.argv[2], sys.argv[3]',
  'img = Image.open(inp).convert("RGB")',
  'mask = Image.open(msk).convert("L")',
  'model = SimpleLama()',
  'res = model(img, mask)',
  'res.save(out, format="PNG")'
].join('\n')

const PYTHON_CANDIDATES = ['python3', 'python']

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

async function runLamaInpaint(image: Buffer, mask: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lamivi-'))
  const inputPath = path.join(tempDir, 'image.png')
  const maskPath = path.join(tempDir, 'mask.png')
  const outputPath = path.join(tempDir, 'output.png')

  try {
    await writeFile(inputPath, image)
    await writeFile(maskPath, mask)

    let lastErr: unknown = null

    for (const py of PYTHON_CANDIDATES) {
      try {
        await execFileAsync(py, ['-c', LAMA_SCRIPT, inputPath, maskPath, outputPath], {
          timeout: 600000,
          maxBuffer: 1024 * 1024 * 8
        })
        const out = await readFile(outputPath)
        return out
      } catch (e) {
        lastErr = e
      }
    }

    throw new Error(`Failed to run LaMa process: ${String(lastErr)}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

app.post('/api/inpaint', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const imageFile = files?.image?.[0]
    const maskFile = files?.mask?.[0]

    const engine = String((req.body as Record<string, unknown>)?.engine ?? 'auto')
    if (engine !== 'auto') {
      res.status(400).json({ error: 'Only engine=auto is supported' })
      return
    }

    if (!imageFile || !maskFile) {
      res.status(400).json({ error: 'Missing image or mask' })
      return
    }

    const out = await runLamaInpaint(imageFile.buffer, maskFile.buffer)
    res.setHeader('content-type', 'image/png')
    res.send(out)
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
