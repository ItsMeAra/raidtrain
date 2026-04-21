import { useEffect, useRef } from 'react'

export default function FlickeringGrid({
  className = '',
  squareSize = 30,
  gap = 2,
  maxOpacity = 0.12,
  color = '255, 193, 7',
  flickerChance = 0.03,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const state = {
      rafId: 0,
      cols: 0,
      rows: 0,
      alphas: [],
      targets: [],
      speed: [],
      reducedMotion: media.matches,
    }

    function initializeGrid() {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const step = squareSize + gap
      state.cols = Math.ceil(rect.width / step)
      state.rows = Math.ceil(rect.height / step)
      const count = state.cols * state.rows
      state.alphas = new Array(count).fill(0).map(() => Math.random() * maxOpacity * 0.45)
      state.targets = new Array(count).fill(0).map(() => Math.random() * maxOpacity)
      state.speed = new Array(count).fill(0).map(() => 0.01 + Math.random() * 0.04)
    }

    function drawFrame() {
      const width = canvas.width / (window.devicePixelRatio || 1)
      const height = canvas.height / (window.devicePixelRatio || 1)
      const step = squareSize + gap

      ctx.clearRect(0, 0, width, height)

      for (let row = 0; row < state.rows; row += 1) {
        for (let col = 0; col < state.cols; col += 1) {
          const idx = row * state.cols + col
          const current = state.alphas[idx]
          const target = state.targets[idx]
          const delta = target - current
          state.alphas[idx] = current + delta * state.speed[idx]

          if (!state.reducedMotion && Math.random() < flickerChance) {
            state.targets[idx] = Math.random() * maxOpacity
          }

          const x = col * step
          const y = row * step

          const alpha = Math.max(0, Math.min(maxOpacity, state.alphas[idx]))
          ctx.fillStyle = `rgba(${color}, ${alpha})`
          ctx.fillRect(x, y, squareSize, squareSize)
        }
      }
    }

    function tick() {
      drawFrame()
      if (!state.reducedMotion) {
        state.rafId = window.requestAnimationFrame(tick)
      }
    }

    function onReduceMotionChange(event) {
      state.reducedMotion = event.matches
      window.cancelAnimationFrame(state.rafId)
      if (state.reducedMotion) {
        drawFrame()
      } else {
        state.rafId = window.requestAnimationFrame(tick)
      }
    }

    function onResize() {
      initializeGrid()
      drawFrame()
    }

    initializeGrid()
    drawFrame()
    if (!state.reducedMotion) {
      state.rafId = window.requestAnimationFrame(tick)
    }

    window.addEventListener('resize', onResize)
    media.addEventListener('change', onReduceMotionChange)

    return () => {
      window.cancelAnimationFrame(state.rafId)
      window.removeEventListener('resize', onResize)
      media.removeEventListener('change', onReduceMotionChange)
    }
  }, [squareSize, gap, maxOpacity, color, flickerChance])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{
        maskImage:
          'radial-gradient(circle at 50% 45%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 48%, rgba(0,0,0,0.1) 100%)',
      }}
    />
  )
}
