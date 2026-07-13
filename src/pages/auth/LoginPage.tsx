import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  Sparkles,
  Shield,
  FlaskConical,
  Package,
  Calculator,
  UserRound,
  ArrowRight,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RightPanel } from './RightPanel'

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginPageProps {
  onForgotPassword?: () => void
  onLoginSuccess?: () => void
}

// ─── Demo accounts config ────────────────────────────────────
const demoAccounts = [
  {
    role: 'Admin',
    name: 'Super Admin',
    email: 'admin@pbims.com',
    password: 'admin123',
    icon: Shield,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    description: 'Full system access',
  },
  {
    role: 'Pharmacist',
    name: 'Ravi Kumar',
    email: 'pharmacist@pbims.com',
    password: 'pharma123',
    icon: FlaskConical,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    description: 'Billing & dispensing',
  },
  {
    role: 'Inventory Manager',
    name: 'Kumar Singh',
    email: 'inventory@pbims.com',
    password: 'stock123',
    icon: Package,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    description: 'Stock & expiry control',
  },
  {
    role: 'Accountant',
    name: 'Priya Sharma',
    email: 'accountant@pbims.com',
    password: 'account123',
    icon: Calculator,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    description: 'Finance & ledger',
  },
  {
    role: 'Salesperson',
    name: 'Arun',
    email: 'arun@gmail.com',
    password: 'arun@123',
    icon: UserRound,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-500/10',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    description: 'Sales & quotations',
  },
]

export default function LoginPage({
  onForgotPassword,
  onLoginSuccess,
}: LoginPageProps) {
  // ─── PRESERVED STATE — DO NOT TOUCH ──────────────────────────
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [loginSucceeded, setLoginSucceeded] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const login = useAuthStore((s) => s.login)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // Close dropdown when clicking outside — PRESERVED
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDemoOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // PRESERVED
  const fillDemo = (account: typeof demoAccounts[0]) => {
    setValue('email', account.email, { shouldValidate: true })
    setValue('password', account.password, { shouldValidate: true })
    setLoginError('')
    setDemoOpen(false)
  }

  // PRESERVED
  const onSubmit = async (data: LoginFormData) => {
    setLoginError('')
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const success = await login(data.email, data.password)

    if (success) {
      setLoginSucceeded(true)
      onLoginSuccess?.()
    } else {
      setLoginError('Invalid credentials. Please check your email and password.')
      setShake(true)
      setTimeout(() => setShake(false), 600)
    }

    setIsLoading(false)
  }

  return (
    <>
      <style>{`
        :root {
          --ms-navy: #0a1628;
          --ms-navy-2: #0f1e35;
          --ms-teal: #0fb5a8;
          --ms-teal-bright: #22d3c5;
          --ms-mint: #a7f3d0;
          --ms-indigo: #6366f1;
        }
        /* Premium 3D outer ring around the brand logo. A metallic conic
           gradient bezel + outer drop shadow for lift, an inset highlight for
           a glassy top edge, and a soft inner shadow so the logo sits recessed
           inside the rim. A slow specular sweep keeps it feeling alive. */
        .ms-logo-3d {
          background:
            conic-gradient(from 210deg,
              #ffffff 0deg, #cfd8e6 70deg, #8b97ad 140deg,
              #ffffff 210deg, #aab6c8 290deg, #ffffff 360deg);
          box-shadow:
            0 10px 24px -8px rgba(10, 22, 40, 0.55),
            0 2px 6px -2px rgba(10, 22, 40, 0.35),
            inset 0 2px 3px rgba(255, 255, 255, 0.9),
            inset 0 -3px 6px rgba(10, 22, 40, 0.35);
          transform: perspective(300px) rotateX(0deg) rotateY(0deg) translateY(0);
          transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        /* Hover: lift + subtle 3D tilt toward the light, deeper shadow. */
        .ms-logo-3d:hover {
          transform: perspective(300px) rotateX(8deg) rotateY(-10deg) translateY(-3px);
          box-shadow:
            0 18px 34px -10px rgba(10, 22, 40, 0.6),
            0 4px 10px -2px rgba(10, 22, 40, 0.4),
            inset 0 2px 3px rgba(255, 255, 255, 0.95),
            inset 0 -3px 6px rgba(10, 22, 40, 0.4);
        }
        /* Static glassy top highlight. */
        .ms-logo-3d::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(160deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 42%);
          pointer-events: none;
          z-index: 2;
        }
        /* Slow rotating specular shine sweeping around the bezel. */
        @keyframes ms-logo-shine {
          to { transform: rotate(360deg); }
        }
        .ms-logo-3d::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 9999px;
          background: conic-gradient(from 0deg,
            rgba(255,255,255,0) 0deg,
            rgba(255,255,255,0) 60deg,
            rgba(255,255,255,0.85) 95deg,
            rgba(255,255,255,0) 130deg,
            rgba(255,255,255,0) 360deg);
          pointer-events: none;
          z-index: 2;
          animation: ms-logo-shine 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ms-logo-3d::before { animation: none; opacity: 0.5; }
          .ms-logo-3d, .ms-logo-3d:hover { transition: none; }
        }
        .ms-logo-3d img {
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.6), inset 0 -2px 5px rgba(10,22,40,0.45);
          position: relative;
          z-index: 1;
        }

        .ms-font-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01' on; }
        .ms-font-body { font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif; }
        .ms-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        /* Staggered entrance */
        @keyframes ms-reveal {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ms-reveal { opacity: 0; animation: ms-reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }

        /* Pulsing status dot */
        @keyframes ms-dot-pulse {
          0% { box-shadow: 0 0 0 0 rgba(15, 181, 168, 0.55); }
          80%, 100% { box-shadow: 0 0 0 8px rgba(15, 181, 168, 0); }
        }
        .ms-pulse-dot { animation: ms-dot-pulse 1.8s cubic-bezier(0.66, 0, 0, 1) infinite; }

        /* Pulsing rings around hero core */
        @keyframes ms-ring-pulse {
          0% { transform: scale(0.7); opacity: 0.85; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .ms-ring-pulse { transform-origin: center; animation: ms-ring-pulse 3s ease-out infinite; }

        /* Floating Y motion */
        @keyframes ms-floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .ms-floatY { animation: ms-floatY 6s ease-in-out infinite; }
        @keyframes ms-floatY-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
        .ms-floatY-slow { animation: ms-floatY-slow 8s ease-in-out infinite; }

        /* Rotation for orbit ring */
        @keyframes ms-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ms-spin-slow { transform-origin: center; animation: ms-spin-slow 42s linear infinite; }
        @keyframes ms-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .ms-spin-rev { transform-origin: center; animation: ms-spin-rev 56s linear infinite; }

        /* Animated flow dashes for connection lines */
        @keyframes ms-flow { to { stroke-dashoffset: -100; } }
        .ms-flow { stroke-dasharray: 4 8; animation: ms-flow 3.5s linear infinite; }

        /* Bar growth pulse */
        @keyframes ms-bar-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
        .ms-bar { animation: ms-bar-pulse 2.4s ease-in-out infinite; }

        /* Background gradient blobs drift */
        @keyframes ms-blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(36px, -28px) scale(1.08); }
        }
        @keyframes ms-blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-28px, 36px) scale(1.12); }
        }
        .ms-blob1 { animation: ms-blob1 22s ease-in-out infinite; }
        .ms-blob2 { animation: ms-blob2 26s ease-in-out infinite; }

        /* Shine sweep for primary button */
        .ms-shine { position: relative; overflow: hidden; }
        .ms-shine::before {
          content: '';
          position: absolute;
          top: 0; left: -120%;
          width: 60%; height: 100%;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
          transform: skewX(-18deg);
          transition: left 0.7s ease;
        }
        .ms-shine:hover:not(:disabled)::before { left: 130%; }
        .ms-shine:hover:not(:disabled) { transform: translateY(-1px); }

        /* Floating label */
        .ms-field input:focus ~ label,
        .ms-field input:not(:placeholder-shown) ~ label {
          top: 8px;
          transform: translateY(0);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .ms-field input:focus ~ label { color: var(--ms-teal); }
        .ms-field input:focus ~ .ms-field-icon { color: var(--ms-teal); }
        .ms-field-wrap:focus-within { border-color: var(--ms-teal); box-shadow: 0 0 0 4px rgba(15, 181, 168, 0.12); }

        /* Dashed link */
        .ms-link {
          padding-bottom: 2px;
          background-image: linear-gradient(90deg, currentColor 50%, transparent 50%);
          background-repeat: no-repeat;
          background-size: 6px 1px;
          background-position: 0 100%;
          transition: background-size 0.2s ease, background-image 0.2s ease;
        }
        .ms-link:hover {
          background-image: linear-gradient(currentColor, currentColor);
          background-size: 100% 1.5px;
        }

        /* Dot grid backdrop */
        .ms-dotgrid {
          background-image: radial-gradient(rgba(230, 237, 247, 0.08) 1px, transparent 1px);
          background-size: 22px 22px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
        }

        /* Floor perspective grid */
        .ms-floor {
          background-image:
            linear-gradient(rgba(34,211,197,0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,197,0.18) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 80%);
          -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 80%);
          transform: perspective(700px) rotateX(62deg) translateZ(0);
          transform-origin: center bottom;
        }

        /* Solid checkbox styling */
        .ms-checkbox[data-state='checked'] {
          background-color: var(--ms-navy) !important;
          border-color: var(--ms-navy) !important;
        }
        .ms-checkbox { border-color: #cbd5e1 !important; }
      `}</style>

      <div
        className="ms-font-body fixed inset-0 w-screen-z h-screen-z overflow-hidden bg-[#f8fafc] text-[#0a1628] flex flex-col-reverse lg:flex-row"
      >

        {/* ─── LEFT PANEL — FORM ──────────────────────────────────── */}
        <aside className="relative w-full lg:w-[45%] h-full flex items-center justify-center px-4 sm:px-6 py-6 lg:px-12 lg:py-8 overflow-y-auto">
          <div className="w-full max-w-full sm:max-w-110">

            {/* Brand row */}
            <div className="ms-reveal flex items-center gap-3" style={{ animationDelay: '0ms' }}>
              <div className="ms-logo-3d relative h-16 w-16 shrink-0 rounded-full p-[3px]">
                <img
                  src="/logo.png"
                  alt="Hospital Suppliers"
                  className="h-full w-full rounded-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
              <div className="flex items-center gap-2.5">
                <span className="ms-font-display text-[20px] font-medium tracking-tight text-[#0a1628]">Hospital Suppliers</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#047857] border border-[#a7f3d0]">
                  <span className="ms-pulse-dot relative inline-block h-1.5 w-1.5 rounded-full bg-[#0fb5a8]" />
                  Network Online
                </span>
              </div>
            </div>

            {/* Headline */}
            <h1
              className="ms-reveal ms-font-display mt-9 text-[32px] leading-[1.05] font-light text-[#0a1628] tracking-[-0.02em]"
              style={{ animationDelay: '160ms' }}
            >
              Welcome <em className="italic text-teal-600">back.</em>
              <br />
              Ship what hospitals need.
            </h1>

            {/* Subtitle */}
            <p
              className="ms-reveal mt-2.5 text-[13px] leading-relaxed text-[#64748b] max-w-100"
              style={{ animationDelay: '240ms' }}
            >
              Sign in to manage tenders, bid on hospital RFQs and track shipments in real time.
            </p>

            {/* Error banner */}
            <AnimatePresence>
              {loginError && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                  role="alert"
                >
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] text-rose-700">
                    {loginError}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="ms-reveal mt-5 space-y-3"
              style={{ animationDelay: '320ms' }}
              animate={{ x: shake ? [0, -10, 10, -10, 10, -5, 5, 0] : 0 }}
              transition={{ x: { duration: 0.5, ease: 'easeInOut' } }}
            >
              {/* Email field */}
              <div className="ms-field">
                <div className="ms-field-wrap relative flex h-13 items-center rounded-xl border border-[#e2e8f0] bg-white pl-11 pr-4 transition-colors">
                  <Mail className="ms-field-icon absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] transition-colors pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder=" "
                    error={!!errors.email}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className="h-13 md:h-13 w-full border-0! shadow-none! bg-transparent! rounded-none! pt-5 pb-1 px-0 text-[14px] text-[#0a1628] focus-visible:border-0! focus-visible:shadow-none! focus-visible:ring-0! focus-visible:outline-none!"
                    {...register('email')}
                  />
                  <label
                    htmlFor="email"
                    className="absolute left-11 top-1/2 -translate-y-1/2 text-[13.5px] text-slate-500 transition-all duration-200 pointer-events-none ms-font-body"
                  >
                    Email address
                  </label>
                </div>
                {errors.email && (
                  <p id="email-error" className="mt-1 text-[11px] text-rose-600" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div className="ms-field">
                <div className="ms-field-wrap relative flex h-13 items-center rounded-xl border border-[#e2e8f0] bg-white pl-11 pr-12 transition-colors">
                  <Lock className="ms-field-icon absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] transition-colors pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder=" "
                    error={!!errors.password}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    className="h-13 md:h-13 w-full border-0! shadow-none! bg-transparent! rounded-none! pt-5 pb-1 px-0 text-[14px] text-[#0a1628] focus-visible:border-0! focus-visible:shadow-none! focus-visible:ring-0! focus-visible:outline-none!"
                    {...register('password')}
                  />
                  <label
                    htmlFor="password"
                    className="absolute left-11 top-1/2 -translate-y-1/2 text-[13.5px] text-slate-500 transition-all duration-200 pointer-events-none ms-font-body"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#0a1628] transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-[11px] text-rose-600" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    aria-label="Remember me"
                    className="ms-checkbox h-4 w-4 rounded-[5px] cursor-pointer"
                  />
                  <Label htmlFor="remember" className="cursor-pointer text-[12.5px] font-normal text-[#475569]">
                    Remember me
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="ms-link cursor-pointer text-[12.5px] font-medium text-[#0a1628] hover:text-[#0fb5a8]"
                >
                  Forgot password?
                </button>
              </div>

              {/* Primary submit button */}
              <button
                type="submit"
                disabled={isLoading || loginSucceeded}
                className="ms-shine group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-b from-[#0f1e35] to-[#0a1628] text-[14px] font-medium tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(10,22,40,0.6)] transition-all duration-200 hover:shadow-[0_16px_30px_-12px_rgba(10,22,40,0.7)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Signing in…</span>
                  </>
                ) : loginSucceeded ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Signed In</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </motion.form>

            {/* Demo Login dropdown — PRESERVED LOGIC */}
            <div
              className="ms-reveal mt-4 relative"
              ref={dropdownRef}
              style={{ animationDelay: '400ms' }}
            >
              <button
                type="button"
                id="demo-login-btn"
                onClick={() => setDemoOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#cbd5e1] bg-white px-4 py-2 text-[12px] font-medium text-[#475569] hover:border-[#0fb5a8] hover:text-[#0a1628] transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#0fb5a8]" />
                Demo Login
                <ChevronDown
                  className={`ml-auto h-4 w-4 transition-transform duration-200 ${demoOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {demoOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-2xl shadow-black/10"
                  >
                    <div className="p-2 space-y-1">
                      <p className="ms-font-mono px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                        Select a demo account
                      </p>
                      {demoAccounts.map((account) => {
                        const Icon = account.icon
                        return (
                          <button
                            key={account.role}
                            type="button"
                            onClick={() => fillDemo(account)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:scale-[1.01] ${account.bg}`}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                              <Icon className={`h-4 w-4 ${account.color}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-[#0a1628]">{account.name}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${account.badge}`}>
                                  {account.role}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-[#64748b]">
                                {account.email} · {account.description}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Vendor attribution */}
            <p className="mt-8 text-center text-[11px] text-[#94a3b8]">
              Powered by{' '}
              <a
                href="https://unitednexa.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#475569] transition-colors hover:text-[#0fb5a8] hover:underline"
              >
                United Nexa Tech
              </a>
            </p>

          </div>
        </aside>

        <RightPanel />
      </div>
    </>
  )
}
