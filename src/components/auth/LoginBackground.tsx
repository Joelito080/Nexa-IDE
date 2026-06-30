import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Fullscreen cinematic Three.js background:
 * floating particle field + central glow sphere.
 */
export default function LoginBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene    = new THREE.Scene()
    const camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.z = 6

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x080909, 1)
    container.appendChild(renderer.domElement)

    // ── Particle field ──────────────────────────────────────────────────────
    const PARTICLE_COUNT = 1200
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors    = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const radius = 4 + Math.random() * 8
      const theta  = Math.random() * Math.PI * 2
      const phi    = Math.acos(2 * Math.random() - 1)

      positions[i3]     = radius * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1]  = radius * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2]  = radius * Math.cos(phi)

      const tint = Math.random()
      colors[i3]     = 0.35 + tint * 0.3   // purple channel
      colors[i3 + 1] = 0.2  + tint * 0.15
      colors[i3 + 2] = 0.7  + tint * 0.3   // blue channel
    }

    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeo.setAttribute('color',    new THREE.BufferAttribute(colors, 3))

    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    scene.add(particles)

    // ── Glow sphere ─────────────────────────────────────────────────────────
    const sphereGeo = new THREE.SphereGeometry(1.15, 64, 64)
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.18,
    })
    const glowSphere = new THREE.Mesh(sphereGeo, sphereMat)
    scene.add(glowSphere)

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.35,
      }),
    )
    scene.add(innerGlow)

    // Outer ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.008, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.4 }),
    )
    ring.rotation.x = Math.PI / 3
    scene.add(ring)

    // Ambient light for depth
    scene.add(new THREE.AmbientLight(0x404080, 0.5))

    // ── Resize ──────────────────────────────────────────────────────────────
    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    // ── Mouse parallax ──────────────────────────────────────────────────────
    let mouseX = 0
    let mouseY = 0
    const onMouse = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth  - 0.5) * 2
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouse)

    // ── Animation loop ──────────────────────────────────────────────────────
    let frameId = 0
    const clock = new THREE.Clock()

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      particles.rotation.y = t * 0.04
      particles.rotation.x = t * 0.015

      glowSphere.scale.setScalar(1 + Math.sin(t * 1.2) * 0.06)
      innerGlow.scale.setScalar(1 + Math.sin(t * 1.8 + 1) * 0.1)
      ring.rotation.z = t * 0.3
      ring.rotation.x = Math.PI / 3 + Math.sin(t * 0.5) * 0.2

      camera.position.x += (mouseX * 0.4 - camera.position.x) * 0.03
      camera.position.y += (-mouseY * 0.3 - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', onMouse)
      ro.disconnect()
      renderer.dispose()
      particleGeo.dispose()
      sphereGeo.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, #0f0a1a 0%, #080909 70%)' }}
    />
  )
}
