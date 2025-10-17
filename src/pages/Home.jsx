import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function Home() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState('')

  const handleCreate = async () => {
    setError('')
    setLoading(true)
    try {
      const docRef = await addDoc(collection(db, 'canvases'), {
        name: 'Untitled Canvas',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        json: null,
      })
      navigate(`/canvas/${docRef.id}`)
    } catch (e) {
      setError('Failed to create canvas. Check Firestore rules and network.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = () => {
    if (!openId.trim()) return
    navigate(`/canvas/${openId.trim()}`)
  }

  return (
    <div className="landing-root">
      <section className="hero">
        <div className="container">
          <h1 className="hero-title">Fast, simple whiteboard for everyone</h1>
          <p className="hero-subtitle">Draw, brainstorm, and collaborate with a delightful Fabric.js powered canvas. No frills, just flow.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : 'Start drawing'}
            </button>
            <div className="open-existing">
              <input className="input" placeholder="Enter canvas ID" value={openId} onChange={(e) => setOpenId(e.target.value)} />
              <button className="btn" onClick={handleOpen}>Open</button>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>

      <section className="features">
        <div className="container features-grid">
          <div className="feature-item">
            <div className="feature-title">Keyboard-first</div>
            <div className="feature-desc">Delete, duplicate, select all — common shortcuts work out of the box.</div>
          </div>
          <div className="feature-item">
            <div className="feature-title">Snap to grid</div>
            <div className="feature-desc">Precise placement with a subtle dotted background grid.</div>
          </div>
          <div className="feature-item">
            <div className="feature-title">Import/Export</div>
            <div className="feature-desc">Save as PNG/SVG or import JSON to continue where you left off.</div>
          </div>
          <div className="feature-item">
            <div className="feature-title">Autoscale canvas</div>
            <div className="feature-desc">Canvas grows as you draw so you never run out of space.</div>
          </div>
        </div>
      </section>
    </div>
  )
}
