import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import * as FabricNS from 'fabric'
import { db } from '../lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function CanvasEditor() {
  const { canvasId } = useParams()
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const fabricLibRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [tool, setTool] = useState('select') 
  const [fill, setFill] = useState('#1e90ff')
  const [stroke, setStroke] = useState('#2d3436')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const GRID = 10

  // History for undo/redo
  const historyRef = useRef({ stack: [], index: -1, restoring: false })
  const importInputRef = useRef(null)

  // Initialize Fabric canvas
  useEffect(() => {
    let disposed = false
    let canvas
    let removeHandlers = () => {}

    const init = async () => {
      try {
        // Resolve fabric from namespace import (works with Fabric v6 ESM)
        const fabric = FabricNS.fabric || FabricNS.default || window.fabric || FabricNS
        if (!fabric) throw new Error('Fabric failed to load')
        fabricLibRef.current = fabric

        const el = canvasRef.current
        canvas = new fabric.Canvas(el, {
          backgroundColor: '#ffffff',
          selection: true,
          preserveObjectStacking: true,
        })
        fabricRef.current = canvas
        
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

        
        let bigWidth = 0
        let bigHeight = 6000 
        const updateScrollOverflow = () => {
          const wrapper = el.parentElement
          const scrollArea = wrapper?.parentElement
          const viewportW = (scrollArea?.clientWidth) || window.innerWidth
          if (!scrollArea) return
          if (canvas.getWidth() <= viewportW) {
            scrollArea.style.overflowX = 'hidden'
          } else {
            scrollArea.style.overflowX = 'auto'
          }
        }

        const clampViewport = () => {
          const wrapper = el.parentElement 
          const scrollArea = wrapper?.parentElement 
          const viewportW = (scrollArea?.clientWidth) || window.innerWidth
          const vpt = canvas.viewportTransform
          
          if (canvas.getWidth() <= viewportW) {
            vpt[4] = 0
          } else {
            
            vpt[4] = Math.min(0, vpt[4])
          }
          canvas.requestRenderAll()
          updateScrollOverflow()
        }

        const resize = () => {
          const wrapper = el.parentElement 
          const scrollArea = wrapper?.parentElement 
          const viewportW = (scrollArea?.clientWidth) || window.innerWidth
          
          const objs = canvas.getObjects()
          const bounds = objs.reduce((acc, o) => {
            const bb = o.getBoundingRect(true)
            acc.maxX = Math.max(acc.maxX, bb.left + bb.width)
            return acc
          }, { maxX: 0 })
          const margin = 200
          
          bigWidth = Math.max(viewportW - 2, Math.ceil(bounds.maxX + margin))
          canvas.setWidth(bigWidth)
          canvas.setHeight(bigHeight)
          canvas.renderAll()
          clampViewport()
        }
        
        const ensureHeight = () => {
          const objs = canvas.getObjects()
          if (!objs.length) return
          const bounds = objs.reduce((acc, o) => {
            const bb = o.getBoundingRect(true)
            acc.maxY = Math.max(acc.maxY, bb.top + bb.height)
            return acc
          }, { maxY: 0 })
          const margin = 800
          if (bounds.maxY + margin > bigHeight) {
            bigHeight = bounds.maxY + margin
            canvas.setHeight(bigHeight)
            canvas.requestRenderAll()
          }
        }
        const ensureWidth = () => {
          const wrapper = el.parentElement
          const scrollArea = wrapper?.parentElement
          const viewportW = (scrollArea?.clientWidth) || window.innerWidth
          const objs = canvas.getObjects()
          const bounds = objs.reduce((acc, o) => {
            const bb = o.getBoundingRect(true)
            acc.maxX = Math.max(acc.maxX, bb.left + bb.width)
            return acc
          }, { maxX: 0 })
          const margin = 200
          const needed = Math.max(viewportW - 2, Math.ceil(bounds.maxX + margin))
          if (needed !== bigWidth) {
            bigWidth = needed
            canvas.setWidth(bigWidth)
            canvas.requestRenderAll()
            clampViewport()
          }
        }
        
        updateScrollOverflow()
        resize()
        window.addEventListener('resize', resize)

        
        const onSelection = () => {
          const active = canvas.getActiveObject()
          setSelected(active || null)
          if (active) {
            if (active.fill) setFill(active.fill)
            if (active.stroke) setStroke(active.stroke)
            if (typeof active.strokeWidth === 'number') setStrokeWidth(active.strokeWidth)
          }
        }
        canvas.on('selection:created', onSelection)
        canvas.on('selection:updated', onSelection)
        canvas.on('selection:cleared', () => setSelected(null))

        
        canvas.on('object:moving', (e) => {
          if (!snapToGrid) return
          const obj = e.target
          obj.set({
            left: Math.round(obj.left / GRID) * GRID,
            top: Math.round(obj.top / GRID) * GRID,
          })
        })
        canvas.on('object:added', () => { ensureHeight(); ensureWidth(); pushHistory() })
        canvas.on('object:modified', () => { ensureHeight(); ensureWidth(); pushHistory() })
        canvas.on('object:removed', () => { ensureHeight(); ensureWidth(); pushHistory() })

        
        const handleKey = (e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && canvas.getActiveObject()) {
            canvas.remove(canvas.getActiveObject())
            canvas.discardActiveObject()
            canvas.requestRenderAll()
            ensureHeight()
          }
        }
        window.addEventListener('keydown', handleKey)

        
        let lastPos = null
        const onMouseDown = (opt) => {
          if (tool !== 'hand') return
          setIsPanning(true)
          const evt = opt.e
          lastPos = { x: evt.clientX, y: evt.clientY }
          canvas.setCursor('grabbing')
        }
        const onMouseMove = (opt) => {
          if (!isPanning || tool !== 'hand' || !lastPos) return
          const evt = opt.e
          const vpt = canvas.viewportTransform
          vpt[4] += evt.clientX - lastPos.x
          vpt[5] += evt.clientY - lastPos.y
          lastPos = { x: evt.clientX, y: evt.clientY }
          canvas.requestRenderAll()
        }
        const onMouseUp = () => {
          if (tool !== 'hand') return
          setIsPanning(false)
          canvas.setCursor('grab')
          clampViewport()
        }
        canvas.on('mouse:down', onMouseDown)
        canvas.on('mouse:move', onMouseMove)
        canvas.on('mouse:up', onMouseUp)

        
        removeHandlers = () => {
          window.removeEventListener('resize', resize)
          window.removeEventListener('keydown', handleKey)
          canvas.off('object:added')
          canvas.off('object:modified')
          canvas.off('object:removed')
          canvas.off('mouse:down', onMouseDown)
          canvas.off('mouse:move', onMouseMove)
          canvas.off('mouse:up', onMouseUp)
        }
      } catch (e) {
        console.error(e)
        setError('Failed to initialize Fabric. Try a hard refresh.')
      }
    }

    init()

    return () => {
      disposed = true
      removeHandlers()
      if (canvas) canvas.dispose()
    }
  }, [])

  
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const snap = await getDoc(doc(db, 'canvases', canvasId))
        if (snap.exists()) {
          const data = snap.data()
          if (data?.json) {
            await new Promise((resolve, reject) => {
              historyRef.current.restoring = true
              fabricRef.current.loadFromJSON(data.json, () => {
                fabricRef.current.renderAll()
                
                historyRef.current = { stack: [data.json], index: 0, restoring: false }
                
                try { window.dispatchEvent(new Event('resize')) } catch {}
                resolve()
              }, (o, obj, err) => {
                if (err) reject(err)
              })
            })
          }
        } else {
          
          await setDoc(doc(db, 'canvases', canvasId), {
            name: 'Untitled Canvas',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            json: null,
          }, { merge: true })
          
          try { window.dispatchEvent(new Event('resize')) } catch {}
        }
      } catch (e) {
        if (!cancelled) setError('Failed to load canvas. Check Firestore rules.')
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canvasId])

  
  const pushHistory = () => {
    if (historyRef.current.restoring) return
    const json = fabricRef.current?.toJSON?.()
    if (!json) return
    
    const { stack, index } = historyRef.current
    const newStack = stack.slice(0, index + 1)
    newStack.push(json)
    
    if (newStack.length > 50) newStack.shift()
    historyRef.current = { stack: newStack, index: newStack.length - 1, restoring: false }
  }

  const undo = async () => {
    const h = historyRef.current
    if (h.index <= 0) return
    h.index -= 1
    h.restoring = true
    const state = h.stack[h.index]
    await new Promise((resolve, reject) => {
      fabricRef.current.loadFromJSON(state, () => { fabricRef.current.renderAll(); resolve() }, (o, obj, err) => { if (err) reject(err) })
    })
    h.restoring = false
  }

  const redo = async () => {
    const h = historyRef.current
    if (h.index >= h.stack.length - 1) return
    h.index += 1
    h.restoring = true
    const state = h.stack[h.index]
    await new Promise((resolve, reject) => {
      fabricRef.current.loadFromJSON(state, () => { fabricRef.current.renderAll(); resolve() }, (o, obj, err) => { if (err) reject(err) })
    })
    h.restoring = false
  }

  
  const addRect = () => {
    const canvas = fabricRef.current
    const fabric = fabricLibRef.current
    if (!canvas || !fabric) return
    const rect = new fabric.Rect({
      left: 100, top: 100, width: 160, height: 100,
      fill, stroke, strokeWidth,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
  }

  const addCircle = () => {
    const canvas = fabricRef.current
    const fabric = fabricLibRef.current
    if (!canvas || !fabric) return
    const circle = new fabric.Circle({
      left: 150, top: 120, radius: 60,
      fill, stroke, strokeWidth,
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
  }

  const addText = () => {
    const canvas = fabricRef.current
    const fabric = fabricLibRef.current
    if (!canvas || !fabric) return
    const text = new fabric.IText('Double-click to edit', {
      left: 120, top: 140,
      fill,
      fontSize: 24,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
  }

  const activatePen = () => {
    const canvas = fabricRef.current
    const fabric = fabricLibRef.current
    if (!canvas || !fabric) return
    canvas.isDrawingMode = true
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
    canvas.freeDrawingBrush.color = stroke
    canvas.freeDrawingBrush.width = strokeWidth
  }

  const deactivatePen = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.isDrawingMode = false
  }

  const applyStyle = useCallback(() => {
    const canvas = fabricRef.current
    const active = canvas.getActiveObject()
    if (!active) return
    if ('fill' in active) active.set('fill', fill)
    if ('stroke' in active) {
      active.set('stroke', stroke)
      active.set('strokeWidth', strokeWidth)
    }
    canvas.requestRenderAll()
  }, [fill, stroke, strokeWidth])

  const onChangeFill = (e) => { setFill(e.target.value) }
  const onChangeStroke = (e) => { setStroke(e.target.value); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.color = e.target.value }
  const onChangeStrokeW = (e) => { const v = Number(e.target.value) || 1; setStrokeWidth(v); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.width = v }

  
  const setZoomCentered = (next) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const center = canvas.getCenter()
    canvas.zoomToPoint({ x: center.left, y: center.top }, next)
    setZoom(next)
    canvas.requestRenderAll()
  }
  const zoomIn = () => setZoomCentered(Math.min(zoom * 1.2, 8))
  const zoomOut = () => setZoomCentered(Math.max(zoom / 1.2, 0.1))
  const zoomReset = () => setZoomCentered(1)

  
  const exportPNG = () => {
    const dataURL = fabricRef.current?.toDataURL({ format: 'png', multiplier: 2 })
    if (!dataURL) return
    const a = document.createElement('a')
    a.href = dataURL
    a.download = `canvas-${canvasId}.png`
    a.click()
  }
  const exportSVG = () => {
    const svg = fabricRef.current?.toSVG()
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `canvas-${canvasId}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJSON = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result)
        historyRef.current.restoring = true
        await new Promise((resolve, reject) => {
          fabricRef.current.loadFromJSON(json, () => { fabricRef.current.renderAll(); resolve() }, (o, obj, err) => { if (err) reject(err) })
        })
        historyRef.current = { stack: [json], index: 0, restoring: false }
      } catch (err) {
        console.error(err)
        setError('Invalid JSON file')
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  // Tool switching
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    if (tool === 'pen') {
      activatePen()
      canvas.selection = false
    } else {
      deactivatePen()
      canvas.selection = tool !== 'hand'
    }
    if (tool === 'hand') {
      canvas.discardActiveObject()
      canvas.setCursor('grab')
    } else {
      canvas.setCursor('default')
    }
    canvas.requestRenderAll()
    
    const vpt = canvas.viewportTransform
    const wrapper = canvasRef.current?.parentElement?.parentElement 
    const viewportW = (wrapper?.clientWidth) || window.innerWidth
    if (canvas.getWidth() <= viewportW) {
      vpt[4] = 0
      canvas.requestRenderAll()
    }
  }, [tool])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const raw = fabricRef.current?.toJSON?.()
      if (!raw) throw new Error('Canvas not ready')
      
      const json = JSON.parse(JSON.stringify(raw))
      await setDoc(
        doc(db, 'canvases', canvasId),
        {
          updatedAt: serverTimestamp(),
          json,
        },
        { merge: true }
      )
    } catch (e) {
      console.error(e)
      setError(`Failed to save canvas: ${e?.message || 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-root">
      <div className="editor-scroll">
        <div className="editor-toolbar" style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTool('select')} style={{ background: tool === 'select' ? '#e8f0fe' : undefined }}>Select</button>
            <button onClick={() => setTool('hand')} style={{ background: tool === 'hand' ? '#e8f0fe' : undefined }}>Hand</button>
            <button onClick={() => { setTool('rect'); addRect() }}>Rect</button>
            <button onClick={() => { setTool('circle'); addCircle() }}>Circle</button>
            <button onClick={() => { setTool('text'); addText() }}>Text</button>
            <button onClick={() => setTool(tool === 'pen' ? 'select' : 'pen')} style={{ background: tool === 'pen' ? '#ffeaa7' : undefined }}>Pen</button>
          </div>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Fill <input type="color" value={fill} onChange={onChangeFill} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Stroke <input type="color" value={stroke} onChange={onChangeStroke} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Stroke W <input style={{ width: 60 }} type="number" min={0} max={20} value={strokeWidth} onChange={onChangeStrokeW} /></label>
          <button onClick={applyStyle} disabled={!selected}>Apply to selection</button>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={zoomOut}>-</button>
            <span style={{ minWidth: 60, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn}>+</button>
            <button onClick={zoomReset}>Reset</button>
          </div>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {}
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Snap <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /></label>
          <div style={{ width: 1, height: 24, background: '#ddd' }} />
          {}
          <button onClick={exportPNG}>Export PNG</button>
          <button onClick={exportSVG}>Export SVG</button>
          <button onClick={() => importInputRef.current?.click()}>Import JSON</button>
          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={importJSON} />
            <div style={{ flex: 1 }} />
            <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
          {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
          {loading && <div style={{ color: '#666', marginTop: 8 }}>Loading canvas…</div>}
        </div>
        <div className="editor-canvas-wrap">
          <div style={{ width: 'fit-content' }}>
            <canvas ref={canvasRef} />
          </div>
          <div style={{ color: '#777', fontSize: 12, marginTop: 8 }}>Canvas ID: {canvasId}</div>
        </div>
      </div>
    </div>
  )
}
