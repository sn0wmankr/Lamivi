export async function inpaintViaApi(opts: {
  image: Blob
  mask: Blob
}): Promise<Blob> {
  const body = new FormData()
  body.append('image', opts.image, 'image.png')
  body.append('mask', opts.mask, 'mask.png')

  const res = await fetch('/api/inpaint', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI 지우기에 실패했습니다 (${res.status}). ${text}`)
  }

  return await res.blob()
}
