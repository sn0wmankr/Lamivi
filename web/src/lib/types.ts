export type Tool = 'brush' | 'text' | 'move'

export type MaskMode = 'add' | 'sub'

export type MaskStroke = {
  id: string
  points: number[]
  strokeWidth: number
  mode: MaskMode
}

export type TextAlign = 'left' | 'center' | 'right'

export type TextItem = {
  id: string
  x: number
  y: number
  text: string
  fontFamily: string
  fontSize: number
  fill: string
  rotation: number
  align: TextAlign
}

export type PageAsset = {
  id: string
  name: string
  width: number
  height: number
  baseDataUrl: string
  maskStrokes: MaskStroke[]
  maskUndo: MaskStroke[][]
  maskRedo: MaskStroke[][]
  texts: TextItem[]
}

export type Engine = 'auto' | 'iopaint'
