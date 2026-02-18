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

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.startsWith('image/')) {
    const text = await res.text().catch(() => '')
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim()
    throw new Error(`AI 복원 API 응답이 이미지가 아닙니다. (/api 경로/프록시 확인) ${snippet}`)
  }

  return await res.blob()
}
