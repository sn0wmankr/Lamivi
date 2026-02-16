import type { Engine } from './types'

export async function inpaintViaApi(opts: {
  image: Blob
  mask: Blob
  engine: Engine
}): Promise<Blob> {
  const body = new FormData()
  body.append('image', opts.image, 'image.png')
  body.append('mask', opts.mask, 'mask.png')
  body.append('engine', opts.engine)

  const res = await fetch('/api/inpaint', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Inpaint failed: ${res.status} ${text}`)
  }

  return await res.blob()
}
