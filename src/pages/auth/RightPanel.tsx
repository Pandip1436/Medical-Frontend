import { Check } from 'lucide-react'

export function RightPanel() {
  return (
    <section
      className="hidden lg:flex relative w-full lg:w-[55%] h-full overflow-hidden text-[#e6edf7]"
      style={{
        background:
          'radial-gradient(1000px 700px at 85% 5%, rgba(34, 211, 197, 0.20) 0%, transparent 60%), radial-gradient(900px 800px at -10% 110%, rgba(99, 102, 241, 0.22) 0%, transparent 55%), linear-gradient(180deg, #0a1628 0%, #0a1628 100%)',
      }}
    >
      {/* Drifting gradient blobs */}
      <div
        className="ms-blob1 absolute top-[-120px] right-[-80px] h-[380px] w-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,211,197,0.32) 0%, transparent 70%)', filter: 'blur(40px)' }}
      />
      <div
        className="ms-blob2 absolute bottom-[-160px] left-[-100px] h-[440px] w-[440px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)', filter: 'blur(50px)' }}
      />

      {/* Dot grid backdrop */}
      <div className="ms-dotgrid absolute inset-0 pointer-events-none" />

      {/* Perspective floor grid */}
      <div className="absolute bottom-0 left-0 right-0 h-[55%] ms-floor opacity-50 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col px-12 py-10 xl:px-16">

        {/* Top row */}
        <div className="flex items-center justify-between">
          <span className="ms-font-mono inline-flex items-center gap-2 rounded-full border border-[rgba(34,211,197,0.35)] bg-[rgba(34,211,197,0.08)] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-[#22d3c5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3c5]" />
            Secure B2B Network
          </span>
          <span className="ms-font-mono rounded-md border border-[rgba(230,237,247,0.15)] bg-[rgba(230,237,247,0.04)] px-2 py-1 text-[10px] tracking-[0.14em] text-[rgba(230,237,247,0.62)]">
            BUILD 2026.05
          </span>
        </div>

        {/* Headline + paragraph */}
        <div className="mt-6 max-w-[560px]">
          <h2 className="ms-font-display text-[40px] leading-[1.05] font-[300] tracking-[-0.02em]">
            Healthcare procurement,{' '}
            <em
              className="italic"
              style={{
                background: 'linear-gradient(90deg, #a7f3d0 0%, #22d3c5 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              simplified.
            </em>
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[rgba(230,237,247,0.7)] max-w-[480px]">
            Real-time tender bidding, verified supplier catalogs and granular
            shipment tracking — wired into the procurement systems of 180+ hospitals.
          </p>
        </div>

        {/* ─── 3D-style "Supply Hub" illustration ────────────── */}
        {/* min-h-0 lets this flex item shrink below the SVG's intrinsic
            aspect-ratio size so the bottom stats strip stays visible on
            short viewports (e.g. Windows 150% scale = 720 CSS px tall). */}
        <div className="relative mx-auto my-4 flex flex-1 min-h-0 w-full max-w-[560px] items-center justify-center">
          <svg viewBox="0 0 600 460" className="h-full w-full" style={{ filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.45))' }}>
            <defs>
              <linearGradient id="rp-crossFront" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#22d3c5" />
                <stop offset="1" stopColor="#0fb5a8" />
              </linearGradient>
              <linearGradient id="rp-crossTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5eead4" />
                <stop offset="1" stopColor="#22d3c5" />
              </linearGradient>
              <linearGradient id="rp-crossSide" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#0fb5a8" />
                <stop offset="1" stopColor="#047857" />
              </linearGradient>

              <linearGradient id="rp-cardSurface" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
                <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
              </linearGradient>
              <linearGradient id="rp-cardSurface2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(34,211,197,0.12)" />
                <stop offset="1" stopColor="rgba(99,102,241,0.06)" />
              </linearGradient>

              <linearGradient id="rp-flowGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="rgba(34,211,197,0)" />
                <stop offset="0.5" stopColor="rgba(34,211,197,0.9)" />
                <stop offset="1" stopColor="rgba(34,211,197,0)" />
              </linearGradient>

              <radialGradient id="rp-coreGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="rgba(34,211,197,0.55)" />
                <stop offset="1" stopColor="rgba(34,211,197,0)" />
              </radialGradient>

              <radialGradient id="rp-sparkle" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
                <stop offset="1" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
            </defs>

            {/* Core radial glow */}
            <circle cx="300" cy="240" r="170" fill="url(#rp-coreGlow)" />

            {/* Orbiting dashed rings */}
            <g className="ms-spin-slow" style={{ transformOrigin: '300px 240px' }}>
              <ellipse cx="300" cy="240" rx="220" ry="80" fill="none" stroke="rgba(34,211,197,0.18)" strokeWidth="1" strokeDasharray="3 7" />
            </g>
            <g className="ms-spin-rev" style={{ transformOrigin: '300px 240px' }}>
              <ellipse cx="300" cy="240" rx="180" ry="140" fill="none" stroke="rgba(99,102,241,0.18)" strokeWidth="1" strokeDasharray="2 6" />
            </g>

            {/* Pulsing concentric rings */}
            <g style={{ transformOrigin: '300px 240px' }}>
              <circle className="ms-ring-pulse" cx="300" cy="240" r="60" fill="none" stroke="rgba(34,211,197,0.45)" strokeWidth="1.5" />
              <circle className="ms-ring-pulse" cx="300" cy="240" r="60" fill="none" stroke="rgba(34,211,197,0.3)" strokeWidth="1.2" style={{ animationDelay: '1.5s' }} />
            </g>

            {/* Connection flow lines from cards to core */}
            <g fill="none" strokeWidth="1.6">
              <path className="ms-flow" d="M 130 150 Q 220 200 280 230" stroke="url(#rp-flowGrad)" />
              <path className="ms-flow" d="M 470 150 Q 380 200 320 230" stroke="url(#rp-flowGrad)" style={{ animationDelay: '1.2s' }} />
              <path className="ms-flow" d="M 110 360 Q 200 320 270 270" stroke="url(#rp-flowGrad)" style={{ animationDelay: '0.6s' }} />
              <path className="ms-flow" d="M 490 360 Q 400 320 330 270" stroke="url(#rp-flowGrad)" style={{ animationDelay: '1.8s' }} />
            </g>

            {/* Ground shadow */}
            <ellipse cx="300" cy="360" rx="110" ry="14" fill="rgba(0,0,0,0.5)" opacity="0.5" />

            {/* Central 3D Medical Cross */}
            <g className="ms-floatY-slow" style={{ transformOrigin: '300px 240px' }}>
              <polygon points="320,170 340,150 340,310 320,330" fill="url(#rp-crossSide)" />
              <polygon points="280,170 320,170 340,150 300,150" fill="url(#rp-crossTop)" />
              <polygon points="380,220 400,200 400,260 380,280" fill="url(#rp-crossSide)" opacity="0.95" />
              <polygon points="220,220 380,220 400,200 240,200" fill="url(#rp-crossTop)" />
              <rect x="280" y="170" width="40" height="160" rx="6" fill="url(#rp-crossFront)" />
              <rect x="220" y="220" width="160" height="60" rx="6" fill="url(#rp-crossFront)" />
              <rect x="280" y="170" width="40" height="160" rx="6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <rect x="220" y="220" width="160" height="60" rx="6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <path d="M 235 207 L 380 207" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
              <path d="M 290 157 L 333 157" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
            </g>

            {/* Card 1: INVENTORY */}
            <g className="ms-floatY" style={{ transformOrigin: '130px 130px' }}>
              <g transform="translate(40 80) skewY(-6)">
                <rect width="180" height="92" rx="12" fill="url(#rp-cardSurface)" stroke="rgba(34,211,197,0.4)" strokeWidth="1" />
                <rect width="180" height="92" rx="12" fill="url(#rp-cardSurface2)" opacity="0.5" />
                <circle cx="16" cy="16" r="3" fill="#22d3c5" />
                <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">INVENTORY</text>
                <text x="16" y="44" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="22" fontWeight="400">12,480</text>
                <text x="16" y="58" fill="rgba(230,237,247,0.55)" fontFamily="Outfit, sans-serif" fontSize="9">SKUs in network</text>
                <g transform="translate(16 68)">
                  {[10, 16, 12, 22, 14, 20, 24].map((h, i) => (
                    <rect
                      key={i}
                      className="ms-bar"
                      x={i * 14}
                      y={24 - h}
                      width="8"
                      height={h}
                      rx="2"
                      fill="#22d3c5"
                      opacity={0.5 + (i % 3) * 0.15}
                      style={{ animationDelay: `${i * 0.25}s` }}
                    />
                  ))}
                </g>
              </g>
            </g>

            {/* Card 2: ORDERS */}
            <g className="ms-floatY" style={{ transformOrigin: '470px 130px', animationDelay: '1.3s' }}>
              <g transform="translate(380 80) skewY(6)">
                <rect width="180" height="92" rx="12" fill="url(#rp-cardSurface)" stroke="rgba(99,102,241,0.45)" strokeWidth="1" />
                <rect width="180" height="92" rx="12" fill="url(#rp-cardSurface2)" opacity="0.5" />
                <circle cx="16" cy="16" r="3" fill="#22d3c5">
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">LIVE ORDERS</text>
                <text x="16" y="44" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="22" fontWeight="400">847</text>
                <text x="16" y="58" fill="rgba(230,237,247,0.55)" fontFamily="Outfit, sans-serif" fontSize="9">active tenders today</text>
                <polyline
                  points="16,86 38,78 60,82 82,70 104,74 126,62 148,66 164,58"
                  fill="none"
                  stroke="#22d3c5"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="16,86 38,78 60,82 82,70 104,74 126,62 148,66 164,58"
                  fill="none"
                  stroke="rgba(34,211,197,0.25)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </g>

            {/* Card 3: SHIPMENTS */}
            <g className="ms-floatY-slow" style={{ transformOrigin: '110px 360px', animationDelay: '0.7s' }}>
              <g transform="translate(20 320) skewY(4)">
                <rect width="180" height="80" rx="12" fill="url(#rp-cardSurface)" stroke="rgba(34,211,197,0.4)" strokeWidth="1" />
                <rect width="180" height="80" rx="12" fill="url(#rp-cardSurface2)" opacity="0.5" />
                <circle cx="16" cy="16" r="3" fill="#22d3c5" />
                <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">SHIPMENTS</text>
                <text x="16" y="42" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="20" fontWeight="400">247 active</text>
                <rect x="16" y="54" width="150" height="6" rx="3" fill="rgba(230,237,247,0.1)" />
                <rect x="16" y="54" width="108" height="6" rx="3" fill="#22d3c5">
                  <animate attributeName="width" values="60;108;88;108" dur="3s" repeatCount="indefinite" />
                </rect>
                <text x="16" y="72" fill="rgba(230,237,247,0.55)" fontFamily="Outfit, sans-serif" fontSize="9">72% delivered on schedule</text>
              </g>
            </g>

            {/* Card 4: NETWORK */}
            <g className="ms-floatY" style={{ transformOrigin: '490px 360px', animationDelay: '2.1s' }}>
              <g transform="translate(400 320) skewY(-4)">
                <rect width="180" height="80" rx="12" fill="url(#rp-cardSurface)" stroke="rgba(99,102,241,0.4)" strokeWidth="1" />
                <rect width="180" height="80" rx="12" fill="url(#rp-cardSurface2)" opacity="0.5" />
                <circle cx="16" cy="16" r="3" fill="#a7f3d0" />
                <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">NETWORK</text>
                <text x="16" y="42" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="20" fontWeight="400">180 hospitals</text>
                <g transform="translate(16 56)">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <circle key={i} cx={i * 14} cy="6" r="6" fill={['#22d3c5', '#6366f1', '#a7f3d0', '#0fb5a8', '#5eead4'][i]} stroke="#0a1628" strokeWidth="1.5" />
                  ))}
                  <circle cx="75" cy="6" r="6" fill="rgba(230,237,247,0.08)" stroke="rgba(230,237,247,0.3)" strokeWidth="1" />
                  <text x="75" y="9.5" fill="rgba(230,237,247,0.8)" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7">+42</text>
                </g>
              </g>
            </g>

            {/* Sparkle particles */}
            {[
              { cx: 230, cy: 110, r: 18, d: '0s' },
              { cx: 420, cy: 90, r: 14, d: '1.2s' },
              { cx: 100, cy: 250, r: 12, d: '2s' },
              { cx: 510, cy: 260, r: 16, d: '0.6s' },
              { cx: 280, cy: 410, r: 12, d: '1.6s' },
              { cx: 350, cy: 60, r: 10, d: '2.4s' },
            ].map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="url(#rp-sparkle)" opacity="0.6">
                <animate attributeName="opacity" values="0.2;0.7;0.2" dur="3s" begin={p.d} repeatCount="indefinite" />
              </circle>
            ))}
          </svg>
        </div>

        {/* Bottom strip — compact stats + compliance pills */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="ms-font-display italic text-[36px] font-[400] leading-none text-[#22d3c5]">2,400+</div>
              <div className="mt-1 text-[12px] text-[rgba(230,237,247,0.7)]">
                verified suppliers · 180 hospitals · 42 countries
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['HIPAA', 'ISO 27001', 'E2E ENCRYPTED'].map((b) => (
                <span
                  key={b}
                  className="ms-font-mono inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,211,197,0.3)] bg-[rgba(34,211,197,0.06)] px-2.5 py-1 text-[9.5px] tracking-[0.16em] text-[#a7f3d0]"
                >
                  <Check className="h-3 w-3 text-[#22d3c5]" />
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
