import { useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Image as KonvaImage, Layer, Line, Stage, Text, Group, Rect, Transformer } from 'react-konva'
import { jsPDF } from 'jspdf'

import './App.css'
import type { Engine, MaskMode, MaskStroke, PageAsset, TextItem, Tool } from './lib/types'
import { importImageFile, importPdfFile } from './lib/importers'
import { inpaintViaApi } from './lib/api'
import { dataUrlToBlob, downloadBlob } from './lib/download'

type Size = { w: number; h: number }

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ w: 800, h: 600 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(1, Math.floor(cr.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}

async function renderMaskToPng(opts: {
  width: number
  height: number
  strokes: MaskStroke[]
}): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'white'

  for (const stroke of opts.strokes) {
    const pts = stroke.points
    if (pts.length < 4) continue
    ctx.lineWidth = stroke.strokeWidth
    ctx.strokeStyle = stroke.mode === 'add' ? 'white' : 'black'
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1])
    }
    ctx.stroke()
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Failed to encode PNG')
  return blob
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

async function renderAssetToDataUrl(asset: PageAsset, pixelRatio = 2): Promise<string> {
  const baseImg = await loadHtmlImage(asset.baseDataUrl)
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: asset.width, height: asset.height })
  const layer = new Konva.Layer()
  stage.add(layer)

  layer.add(new Konva.Image({ image: baseImg, x: 0, y: 0, width: asset.width, height: asset.height }))

  for (const t of asset.texts) {
    layer.add(
      new Konva.Text({
        x: t.x,
        y: t.y,
        text: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fill: t.fill,
        rotation: t.rotation,
        align: t.align,
      }),
    )
  }

  layer.draw()
  const dataUrl = stage.toDataURL({ pixelRatio })
  stage.destroy()
  return dataUrl
}

const FONT_FAMILIES = [
  'IBM Plex Sans',
  'Fraunces',
  'Georgia',
  'Times New Roman',
  'Arial',
  'Courier New',
]

const DEFAULT_TEXT: Omit<TextItem, 'id' | 'x' | 'y'> = {
  text: '텍스트',
  fontFamily: 'IBM Plex Sans',
  fontSize: 42,
  fill: '#ffffff',
  rotation: 0,
  align: 'left',
}

function App() {
  const [assets, setAssets] = useState<PageAsset[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = useMemo(() => assets.find((a) => a.id === activeId) ?? null, [assets, activeId])

  const [tool, setTool] = useState<Tool>('brush')
  const [engine, setEngine] = useState<Engine>('auto')
  const [brushSize, setBrushSize] = useState(34)
  const [maskMode, setMaskMode] = useState<MaskMode>('add')
  const [exportPixelRatio, setExportPixelRatio] = useState(2)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const selectedText = useMemo(
    () => active?.texts.find((t) => t.id === selectedTextId) ?? null,
    [active, selectedTextId],
  )

  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')

  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const textNodeRefs = useRef<Record<string, Konva.Text>>({})
  const { ref: wrapRef, size: wrapSize } = useElementSize<HTMLDivElement>()
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null)

  const [dragGuides, setDragGuides] = useState<{ x?: number; y?: number }>({})
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const fit = useMemo(() => {
    if (!active) return { scale: 1, ox: 0, oy: 0 }
    const padding = 24
    const cw = Math.max(1, wrapSize.w - padding * 2)
    const ch = Math.max(1, wrapSize.h - padding * 2)
    const scale = Math.min(cw / active.width, ch / active.height)
    const w = active.width * scale
    const h = active.height * scale
    const ox = (wrapSize.w - w) / 2
    const oy = (wrapSize.h - h) / 2
    return { scale, ox, oy }
  }, [active, wrapSize])

  useEffect(() => {
    setSelectedTextId(null)
    if (!active) {
      setBaseImg(null)
      return
    }
    loadHtmlImage(active.baseDataUrl)
      .then((img) => setBaseImg(img))
      .catch(() => setBaseImg(null))
  }, [activeId])

  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    if (!active || !selectedTextId) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }
    const node = textNodeRefs.current[selectedTextId]
    if (node) {
      tr.nodes([node])
      tr.getLayer()?.batchDraw()
    }
  }, [activeId, selectedTextId, active])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy('Importing…')
    setStatus('Importing files')
    try {
      const imported: PageAsset[] = []
      for (const file of Array.from(files)) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const pages = await importPdfFile(file)
          for (const p of pages) {
            imported.push({
              id: uid('page'),
              name: p.name,
              width: p.width,
              height: p.height,
              baseDataUrl: p.dataUrl,
              maskStrokes: [],
              maskUndo: [],
              maskRedo: [],
              texts: [],
            })
          }
        } else if (file.type.startsWith('image/')) {
          const img = await importImageFile(file)
          imported.push({
            id: uid('img'),
            name: img.name,
            width: img.width,
            height: img.height,
            baseDataUrl: img.dataUrl,
            maskStrokes: [],
            maskUndo: [],
            maskRedo: [],
            texts: [],
          })
        }
      }

      setAssets((prev) => {
        const next = [...prev, ...imported]
        return next
      })
      if (!activeId && imported[0]) setActiveId(imported[0].id)
      setStatus(`Imported ${imported.length} page(s)`) 
    } finally {
      setBusy(null)
    }
  }

  function updateActive(mutator: (a: PageAsset) => PageAsset) {
    if (!active) return
    setAssets((prev) => prev.map((a) => (a.id === active.id ? mutator(a) : a)))
  }

  function clearMask() {
    if (!active) return
    updateActive((a) => {
      if (a.maskStrokes.length === 0) return a
      const nextUndo = [...a.maskUndo, a.maskStrokes]
      return { ...a, maskStrokes: [], maskUndo: nextUndo.slice(-80), maskRedo: [] }
    })
  }

  function undoMask() {
    if (!active) return
    updateActive((a) => {
      const prev = a.maskUndo[a.maskUndo.length - 1]
      if (!prev) return a
      const nextUndo = a.maskUndo.slice(0, -1)
      const nextRedo = [...a.maskRedo, a.maskStrokes].slice(-80)
      return { ...a, maskStrokes: prev, maskUndo: nextUndo, maskRedo: nextRedo }
    })
  }

  function redoMask() {
    if (!active) return
    updateActive((a) => {
      const next = a.maskRedo[a.maskRedo.length - 1]
      if (!next) return a
      const nextRedo = a.maskRedo.slice(0, -1)
      const nextUndo = [...a.maskUndo, a.maskStrokes].slice(-80)
      return { ...a, maskStrokes: next, maskUndo: nextUndo, maskRedo: nextRedo }
    })
  }

  function clearTexts() {
    updateActive((a) => ({ ...a, texts: [] }))
    setSelectedTextId(null)
  }

  function addText() {
    if (!active) return
    const x = active.width * 0.12
    const y = active.height * 0.18
    const item: TextItem = {
      id: uid('text'),
      x,
      y,
      ...DEFAULT_TEXT,
    }
    updateActive((a) => ({ ...a, texts: [...a.texts, item] }))
    setSelectedTextId(item.id)
    setTool('text')
  }

  function updateSelectedText(patch: Partial<TextItem>) {
    if (!active || !selectedTextId) return
    updateActive((a) => ({
      ...a,
      texts: a.texts.map((t) => (t.id === selectedTextId ? { ...t, ...patch } : t)),
    }))
  }

  // Drawing state
  const drawing = useRef<{ strokeId: string } | null>(null)

  function pointerToImageXY(stage: Konva.Stage) {
    const p = stage.getPointerPosition()
    if (!p || !active) return null
    const x = (p.x - fit.ox) / fit.scale
    const y = (p.y - fit.oy) / fit.scale
    return { x: clamp(x, 0, active.width), y: clamp(y, 0, active.height) }
  }

  function onStageMouseDown() {
    const stage = stageRef.current
    if (!stage || !active) return

    if (tool !== 'brush') {
      if (tool === 'move') {
        setSelectedTextId(null)
      }
      return
    }

    const xy = pointerToImageXY(stage)
    if (!xy) return
    const id = uid('stroke')
    const stroke: MaskStroke = { id, points: [xy.x, xy.y], strokeWidth: brushSize, mode: maskMode }
    drawing.current = { strokeId: id }
    updateActive((a) => {
      const nextUndo = [...a.maskUndo, a.maskStrokes].slice(-80)
      return { ...a, maskStrokes: [...a.maskStrokes, stroke], maskUndo: nextUndo, maskRedo: [] }
    })
  }

  function onStageMouseMove() {
    const stage = stageRef.current
    if (!stage || !active) return
    const d = drawing.current
    if (!d || tool !== 'brush') return
    const xy = pointerToImageXY(stage)
    if (!xy) return
    updateActive((a) => ({
      ...a,
      maskStrokes: a.maskStrokes.map((s) =>
        s.id === d.strokeId ? { ...s, points: [...s.points, xy.x, xy.y] } : s,
      ),
    }))
  }

  function onStageMouseUp() {
    drawing.current = null
  }

  async function runInpaint() {
    if (!active) return
    if (active.maskStrokes.length === 0) {
      setStatus('Mask is empty')
      return
    }
    setBusy('Inpainting…')
    setStatus('Inpainting…')
    try {
      const imageBlob = await dataUrlToBlob(active.baseDataUrl)
      const maskBlob = await renderMaskToPng({
        width: active.width,
        height: active.height,
        strokes: active.maskStrokes,
      })

      const resultBlob = await inpaintViaApi({ image: imageBlob, mask: maskBlob, engine })
      const resultUrl = URL.createObjectURL(resultBlob)
      updateActive((a) => ({ ...a, baseDataUrl: resultUrl, maskStrokes: [], maskUndo: [], maskRedo: [] }))
      setStatus('Done')
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(null)
    }
  }

  async function exportPngCurrent() {
    if (!active) return
    setBusy('Exporting…')
    try {
      const dataUrl = await renderAssetToDataUrl(active, exportPixelRatio)
      const blob = await dataUrlToBlob(dataUrl)
      downloadBlob(blob, `${active.name.replaceAll('#', '_')}.png`)
      setStatus('Exported PNG')
    } finally {
      setBusy(null)
    }
  }

  async function exportPdfAll() {
    if (assets.length === 0) return
    setBusy('Exporting PDF…')
    setStatus('Exporting PDF…')
    try {
      let pdf: jsPDF | null = null

      for (let idx = 0; idx < assets.length; idx++) {
        const a = assets[idx]!
        const dataUrl = await renderAssetToDataUrl(a, exportPixelRatio)

        const pageW = a.width
        const pageH = a.height
        if (!pdf) {
          pdf = new jsPDF({
            unit: 'px',
            format: [pageW, pageH],
            orientation: pageW >= pageH ? 'landscape' : 'portrait',
          })
        } else {
          pdf.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait')
        }
        pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH)
      }

      if (!pdf) throw new Error('No pages to export')
      const blob = pdf.output('blob')
      downloadBlob(blob, 'lamivi-export.pdf')
      setStatus('Exported PDF')
    } finally {
      setBusy(null)
    }
  }

  function beginInlineEdit(t: TextItem) {
    setEditingTextId(t.id)
    setEditingValue(t.text)
  }

  function commitInlineEdit() {
    if (!editingTextId) return
    const next = editingValue
    updateActive((a) => ({
      ...a,
      texts: a.texts.map((t) => (t.id === editingTextId ? { ...t, text: next } : t)),
    }))
    setEditingTextId(null)
  }

  function cancelInlineEdit() {
    setEditingTextId(null)
  }

  function snapTextDuringDrag(node: Konva.Text, asset: PageAsset) {
    const threshold = 8
    const rect = node.getClientRect({ relativeTo: node.getParent() ?? undefined })
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2

    const guidesX = [0, asset.width / 2, asset.width]
    const guidesY = [0, asset.height / 2, asset.height]

    let snappedX: number | undefined
    let snappedY: number | undefined

    for (const gx of guidesX) {
      if (Math.abs(centerX - gx) <= threshold) {
        const dx = gx - centerX
        node.x(node.x() + dx)
        snappedX = gx
        break
      }
    }

    for (const gy of guidesY) {
      if (Math.abs(centerY - gy) <= threshold) {
        const dy = gy - centerY
        node.y(node.y() + dy)
        snappedY = gy
        break
      }
    }

    setDragGuides({ x: snappedX, y: snappedY })
  }

  const stageCursor = useMemo(() => {
    if (tool === 'brush') return 'crosshair'
    if (tool === 'text') return 'text'
    return 'default'
  }, [tool])

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>Lamivi</h1>
          <div className="tag">erase + add text · multi image/PDF</div>
        </div>

        <div className="toolbar">
          <label className="btn">
            Import
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,.pdf"
              onChange={(e) => void handleFiles(e.target.files)}
              style={{ display: 'none' }}
            />
          </label>

          <button className={`btn ${tool === 'brush' ? 'selected' : ''}`} onClick={() => setTool('brush')}>
            Brush
          </button>
          <button
            className={`btn ${tool === 'brush' && maskMode === 'add' ? 'selected' : ''}`}
            onClick={() => {
              setTool('brush')
              setMaskMode('add')
            }}
            disabled={!active}
          >
            Mask+
          </button>
          <button
            className={`btn ${tool === 'brush' && maskMode === 'sub' ? 'selected' : ''}`}
            onClick={() => {
              setTool('brush')
              setMaskMode('sub')
            }}
            disabled={!active}
          >
            Erase mask
          </button>
          <button className={`btn ${tool === 'text' ? 'selected' : ''}`} onClick={() => setTool('text')}>
            Text
          </button>
          <button className={`btn ${tool === 'move' ? 'selected' : ''}`} onClick={() => setTool('move')}>
            Move
          </button>

          <button className="btn" onClick={addText} disabled={!active}>
            Add text
          </button>
          <button className="btn" onClick={undoMask} disabled={!active || active.maskUndo.length === 0}>
            Undo mask
          </button>
          <button className="btn" onClick={redoMask} disabled={!active || active.maskRedo.length === 0}>
            Redo mask
          </button>
          <button className="btn danger" onClick={clearMask} disabled={!active || active.maskStrokes.length === 0}>
            Clear mask
          </button>
          <button className="btn danger" onClick={clearTexts} disabled={!active || active.texts.length === 0}>
            Clear texts
          </button>

          <button className="btn primary" onClick={() => void runInpaint()} disabled={!active || !!busy}>
            Erase (AI)
          </button>

          <button className="btn" onClick={() => void exportPngCurrent()} disabled={!active || !!busy}>
            Export PNG
          </button>
          <button className="btn" onClick={() => void exportPdfAll()} disabled={assets.length === 0 || !!busy}>
            Export PDF
          </button>
        </div>

        <div className="status">{busy ?? status}</div>
      </div>

      <div className="main">
        <div className="panel">
          <div className="panelHeader">
            <div className="title">Files</div>
          </div>
          <div className="panelBody">
            <div className="assetList">
              {assets.length === 0 ? (
                <div className="hint">
                  Import images or a PDF. PDF pages become separate editable pages.
                </div>
              ) : null}
              {assets.map((a) => (
                <div
                  key={a.id}
                  className={`asset ${a.id === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(a.id)}
                >
                  <img className="thumb" src={a.baseDataUrl} alt={a.name} />
                  <div className="assetMeta">
                    <div className="assetName">{a.name}</div>
                    <div className="assetSub">
                      {a.width}×{a.height} · mask {a.maskStrokes.length} · text {a.texts.length}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="canvasWrap" ref={wrapRef}>
          {active ? (
            <>
              {editingTextId && selectedText ? (
                <textarea
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitInlineEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelInlineEdit()
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      commitInlineEdit()
                    }
                  }}
                  className="input"
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    left: fit.ox + selectedText.x * fit.scale,
                    top: fit.oy + selectedText.y * fit.scale,
                    width: Math.max(160, 420 * fit.scale),
                    height: Math.max(44, 90 * fit.scale),
                    resize: 'none',
                  }}
                  autoFocus
                />
              ) : null}

              <Stage
                ref={(n) => {
                  stageRef.current = n
                }}
              width={wrapSize.w}
              height={wrapSize.h}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={onStageMouseUp}
              style={{ cursor: stageCursor }}
            >
              <Layer>
                <Group x={fit.ox} y={fit.oy} scaleX={fit.scale} scaleY={fit.scale}>
                  <Rect x={0} y={0} width={active.width} height={active.height} fill="rgba(0,0,0,0.08)" />
                  {baseImg ? (
                    <KonvaImage image={baseImg} x={0} y={0} width={active.width} height={active.height} />
                  ) : null}
                </Group>
              </Layer>

              <Layer>
                <Group x={fit.ox} y={fit.oy} scaleX={fit.scale} scaleY={fit.scale}>
                  {active.texts.map((t) => (
                    <Text
                      key={t.id}
                      x={t.x}
                      y={t.y}
                      text={t.text}
                      fontFamily={t.fontFamily}
                      fontSize={t.fontSize}
                      fill={t.fill}
                      rotation={t.rotation}
                      align={t.align}
                      draggable={tool !== 'brush'}
                      ref={(node) => {
                        if (node) textNodeRefs.current[t.id] = node
                      }}
                      onClick={() => {
                        setSelectedTextId(t.id)
                        setTool('text')
                      }}
                      onTap={() => {
                        setSelectedTextId(t.id)
                        setTool('text')
                      }}
                      onDblClick={() => {
                        setSelectedTextId(t.id)
                        beginInlineEdit(t)
                      }}
                      onDblTap={() => {
                        setSelectedTextId(t.id)
                        beginInlineEdit(t)
                      }}
                      onDragStart={() => setSelectedTextId(t.id)}
                      onDragMove={(e) => {
                        if (!active) return
                        snapTextDuringDrag(e.target as Konva.Text, active)
                      }}
                      onDragEnd={(e) => {
                        setDragGuides({})
                        updateActive((a) => ({
                          ...a,
                          texts: a.texts.map((tt) =>
                            tt.id === t.id ? { ...tt, x: e.target.x(), y: e.target.y() } : tt,
                          ),
                        }))
                      }}
                      onTransformEnd={(e) => {
                        const node = e.target as Konva.Text
                        const scale = Math.max(0.2, Math.max(node.scaleX(), node.scaleY()))
                        const nextFontSize = clamp(Math.round(t.fontSize * scale), 8, 240)
                        node.scaleX(1)
                        node.scaleY(1)
                        updateActive((a) => ({
                          ...a,
                          texts: a.texts.map((tt) =>
                            tt.id === t.id
                              ? {
                                  ...tt,
                                  x: node.x(),
                                  y: node.y(),
                                  rotation: node.rotation(),
                                  fontSize: nextFontSize,
                                }
                              : tt,
                          ),
                        }))
                      }}
                      stroke={selectedTextId === t.id ? 'rgba(100,210,255,0.85)' : undefined}
                      strokeWidth={selectedTextId === t.id ? 2 : 0}
                      shadowColor={selectedTextId === t.id ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.35)'}
                      shadowBlur={selectedTextId === t.id ? 12 : 8}
                      shadowOpacity={0.9}
                    />
                  ))}

                  <Transformer
                    ref={(n) => {
                      transformerRef.current = n
                    }}
                    rotateEnabled
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    anchorSize={10}
                    borderStroke="rgba(100,210,255,0.85)"
                    borderDash={[4, 4]}
                    keepRatio
                  />
                </Group>
              </Layer>

              <Layer>
                <Group x={fit.ox} y={fit.oy} scaleX={fit.scale} scaleY={fit.scale}>
                  {active.maskStrokes.map((l) => (
                    <Line
                      key={l.id}
                      points={l.points}
                      stroke={l.mode === 'add' ? 'rgba(255, 86, 86, 0.70)' : 'rgba(100, 210, 255, 0.55)'}
                      strokeWidth={l.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      tension={0}
                    />
                  ))}

                  {dragGuides.x !== undefined ? (
                    <Line points={[dragGuides.x, 0, dragGuides.x, active.height]} stroke="rgba(100,210,255,0.35)" strokeWidth={1} />
                  ) : null}
                  {dragGuides.y !== undefined ? (
                    <Line points={[0, dragGuides.y, active.width, dragGuides.y]} stroke="rgba(100,210,255,0.35)" strokeWidth={1} />
                  ) : null}
                </Group>
              </Layer>
              </Stage>
            </>
          ) : (
            <div className="panelBody">
              <div className="hint">Import an image or PDF to start.</div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="title">Controls</div>
          </div>
          <div className="panelBody">
            <div className="row">
              <div className="label">Engine</div>
              <select className="select" value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
                <option value="auto">auto</option>
                <option value="iopaint">iopaint</option>
              </select>
              <div className="hint">
                `auto` uses IOPaint via the server proxy.
              </div>
            </div>

            <div className="row">
              <div className="label">Brush size</div>
              <input
                className="input"
                type="range"
                min={6}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
              <div className="hint">{brushSize}px</div>
            </div>

            <div className="row">
              <div className="label">Export quality</div>
              <select
                className="select"
                value={String(exportPixelRatio)}
                onChange={(e) => setExportPixelRatio(clamp(Number(e.target.value), 1, 3))}
              >
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
              </select>
              <div className="hint">Higher = sharper exports, more CPU/memory.</div>
            </div>

            <div className="row">
              <div className="label">Selected text</div>
              {selectedText ? (
                <>
                  <input
                    className="input"
                    value={selectedText.text}
                    onChange={(e) => updateSelectedText({ text: e.target.value })}
                  />
                  <div className="split">
                    <div>
                      <div className="label">Font</div>
                      <select
                        className="select"
                        value={selectedText.fontFamily}
                        onChange={(e) => updateSelectedText({ fontFamily: e.target.value })}
                      >
                        {FONT_FAMILIES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="label">Size</div>
                      <input
                        className="input"
                        type="number"
                        min={8}
                        max={240}
                        value={selectedText.fontSize}
                        onChange={(e) => updateSelectedText({ fontSize: clamp(Number(e.target.value), 8, 240) })}
                      />
                    </div>
                  </div>

                  <div className="split">
                    <div>
                      <div className="label">Color</div>
                      <input
                        className="input"
                        type="color"
                        value={selectedText.fill}
                        onChange={(e) => updateSelectedText({ fill: e.target.value })}
                      />
                    </div>
                    <div>
                      <div className="label">Rotation</div>
                      <input
                        className="input"
                        type="number"
                        value={selectedText.rotation}
                        onChange={(e) => updateSelectedText({ rotation: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="row">
                    <div className="label">Align</div>
                    <select
                      className="select"
                      value={selectedText.align}
                      onChange={(e) => updateSelectedText({ align: e.target.value as TextItem['align'] })}
                    >
                      <option value="left">left</option>
                      <option value="center">center</option>
                      <option value="right">right</option>
                    </select>
                  </div>

                  <button
                    className="btn danger"
                    onClick={() => {
                      const id = selectedText.id
                      updateActive((a) => ({ ...a, texts: a.texts.filter((t) => t.id !== id) }))
                      setSelectedTextId(null)
                    }}
                  >
                    Delete text
                  </button>
                </>
              ) : (
                <div className="hint">Click a text item on the canvas (or “Add text”).</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
