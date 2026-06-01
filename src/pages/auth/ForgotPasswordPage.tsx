import { useState, useRef, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Mail,
  ArrowLeft,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Check,
  ShieldCheck,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ── Schemas ──────────────────────────────────────────────────

const emailSchema = z.object({
  emailOrPhone: z
    .string()
    .min(1, 'Email or phone is required')
    .refine(
      (val) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || /^\d{10}$/.test(val),
      'Enter a valid email or 10-digit phone number',
    ),
})

type EmailFormData = z.infer<typeof emailSchema>

const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least 1 uppercase letter')
      .regex(/[0-9]/, 'Must contain at least 1 number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

// ── Constants ────────────────────────────────────────────────

const RESEND_COOLDOWN = 60

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
}

const stepLabels = ['Verify', 'OTP', 'Reset']

// ── Component ────────────────────────────────────────────────

interface ForgotPasswordPageProps {
  onBackToLogin?: () => void
}

export default function ForgotPasswordPage({
  onBackToLogin,
}: ForgotPasswordPageProps) {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [savedContact, setSavedContact] = useState('')
  const [redirectReady, setRedirectReady] = useState(false)

  // ── Step 1: Email form ──────────────────────────────────────
  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { emailOrPhone: '' },
  })

  const handleSendOtp = async (data: EmailFormData) => {
    setIsLoading(true)
    try {
      await api.post('/auth/forgot-password', { contact: data.emailOrPhone })
      setSavedContact(data.emailOrPhone)
      toast.success('OTP sent successfully!', {
        description: `A 6-digit code has been sent to ${data.emailOrPhone}`,
      })
      setStep(2)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to send OTP')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: OTP ─────────────────────────────────────────────
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''))
  const [otpError, setOtpError] = useState('')
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN)
  const [canResend, setCanResend] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (step !== 2) return
    setResendTimer(RESEND_COOLDOWN)
    setCanResend(false)

    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true)
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step])

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }, [step])

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return

      const digit = value.slice(-1)
      const newOtp = [...otp]
      newOtp[index] = digit
      setOtp(newOtp)
      setOtpError('')

      if (digit && index < 5) {
        otpRefs.current[index + 1]?.focus()
      }

      const fullOtp = newOtp.join('')
      if (fullOtp.length === 6) {
        verifyOtp(fullOtp)
      }
    },
    [otp],
  )

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !otp[index] && index > 0) {
        otpRefs.current[index - 1]?.focus()
      }
    },
    [otp],
  )

  const handleOtpPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (pasted.length === 0) return

      const newOtp = Array(6).fill('')
      for (let i = 0; i < pasted.length; i++) {
        newOtp[i] = pasted[i]
      }
      setOtp(newOtp)
      setOtpError('')

      const focusIndex = Math.min(pasted.length, 5)
      otpRefs.current[focusIndex]?.focus()

      if (pasted.length === 6) {
        verifyOtp(pasted)
      }
    },
    [],
  )

  const verifyOtp = async (code: string) => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 600))

    try {
      await api.post('/auth/verify-otp', { contact: savedContact, otp: code })
      toast.success('OTP verified successfully!')
      setStep(3)
    } catch {
      setOtpError('Invalid OTP. Please try again.')
      setOtp(Array(6).fill(''))
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
    setIsLoading(false)
  }

  const handleResendOtp = async () => {
    if (!canResend) return
    setCanResend(false)
    setResendTimer(RESEND_COOLDOWN)
    toast.success('OTP resent!', {
      description: `A new code has been sent to ${savedContact}`,
    })

    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true)
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // ── Step 3: New password ────────────────────────────────────
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  const handleResetPassword = async (data: PasswordFormData) => {
    setIsLoading(true)
    try {
      await api.post('/auth/reset-password', { contact: savedContact, newPassword: data.newPassword })
      toast.success('Password reset successfully!', {
        description: 'You can now sign in with your new password.',
      })
      setRedirectReady(true)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step indicator ──────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-0">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold transition-all duration-300',
                step > s && 'bg-[#0fb5a8] text-white shadow-[0_4px_12px_-4px_rgba(15,181,168,0.5)]',
                step === s && 'bg-[#0a1628] text-white shadow-[0_4px_12px_-4px_rgba(10,22,40,0.6)]',
                step < s && 'bg-[#eef2f7] text-[#94a3b8]',
              )}
              aria-label={`Step ${s}${step === s ? ' (current)' : ''}`}
              aria-current={step === s ? 'step' : undefined}
            >
              {step > s ? (
                <Check className="h-4 w-4" />
              ) : (
                s
              )}
            </div>
            <span
              className={cn(
                'ms-font-mono text-[9px] uppercase tracking-[0.16em] transition-colors',
                step >= s ? 'text-[#0a1628]' : 'text-[#94a3b8]',
              )}
            >
              {stepLabels[i]}
            </span>
          </div>
          {i < 2 && (
            <div
              className={cn(
                'h-[2px] w-12 mb-5 transition-colors duration-300 rounded-full',
                step > s ? 'bg-[#0fb5a8]' : 'bg-[#eef2f7]',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )

  // Eyebrow text per step
  const eyebrowText =
    redirectReady ? 'Account Recovery · Complete' : `Account Recovery · Step ${step}/3`

  const headlineText =
    redirectReady
      ? 'You’re all set.'
      : step === 1
      ? 'Reset your password.'
      : step === 2
      ? 'Verify it’s you.'
      : 'Choose a new password.'

  const headlineItalicWord =
    redirectReady ? 'set.' : step === 1 ? 'password.' : step === 2 ? 'you.' : 'password.'

  return (
    <>
      <style>{`
        :root {
          --ms-navy: #0a1628;
          --ms-teal: #0fb5a8;
          --ms-teal-bright: #22d3c5;
          --ms-mint: #a7f3d0;
          --ms-indigo: #6366f1;
        }
        .ms-font-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01' on; }
        .ms-font-body { font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif; }
        .ms-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        @keyframes ms-reveal {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ms-reveal { opacity: 0; animation: ms-reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }

        @keyframes ms-dot-pulse {
          0% { box-shadow: 0 0 0 0 rgba(15, 181, 168, 0.55); }
          80%, 100% { box-shadow: 0 0 0 8px rgba(15, 181, 168, 0); }
        }
        .ms-pulse-dot { animation: ms-dot-pulse 1.8s cubic-bezier(0.66, 0, 0, 1) infinite; }

        @keyframes ms-ring-pulse {
          0% { transform: scale(0.7); opacity: 0.85; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .ms-ring-pulse { transform-origin: center; animation: ms-ring-pulse 3s ease-out infinite; }

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

        @keyframes ms-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ms-spin-slow { transform-origin: center; animation: ms-spin-slow 42s linear infinite; }
        @keyframes ms-spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .ms-spin-rev { transform-origin: center; animation: ms-spin-rev 56s linear infinite; }

        @keyframes ms-flow { to { stroke-dashoffset: -100; } }
        .ms-flow { stroke-dasharray: 4 8; animation: ms-flow 3.5s linear infinite; }

        @keyframes ms-key-jiggle {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }
        .ms-key { animation: ms-key-jiggle 4s ease-in-out infinite; transform-origin: center; }

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

        .ms-dotgrid {
          background-image: radial-gradient(rgba(230, 237, 247, 0.08) 1px, transparent 1px);
          background-size: 22px 22px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
        }

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

        /* OTP boxes */
        .ms-otp-input {
          font-family: 'Fraunces', Georgia, serif;
          font-feature-settings: 'lnum' on;
        }
        .ms-otp-input:focus {
          border-color: var(--ms-teal) !important;
          box-shadow: 0 0 0 4px rgba(15, 181, 168, 0.12);
        }
      `}</style>

      <div className="ms-font-body fixed inset-0 w-screen-z h-screen-z overflow-hidden bg-[#f8fafc] text-[#0a1628] flex flex-col-reverse lg:flex-row">

        {/* ─── LEFT PANEL — FORM ──────────────────────────────────── */}
        <aside className="relative w-full lg:w-[45%] h-full flex items-center justify-center px-6 py-6 lg:px-12 lg:py-8 overflow-y-auto">
          <div className="w-full max-w-[460px]">

            {/* Brand row */}
            <div className="ms-reveal flex items-center gap-3" style={{ animationDelay: '0ms' }}>
              <div className="relative h-10 w-10 rounded-xl bg-[#0a1628] flex items-center justify-center rotate-[6deg] shadow-[0_8px_20px_-8px_rgba(10,22,40,0.5)]">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] -rotate-[6deg]" fill="none" stroke="#22d3c5" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 4v16M4 12h16" />
                </svg>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="ms-font-display text-[20px] font-[500] tracking-tight text-[#0a1628]">Hospital Suppliers</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#047857] border border-[#a7f3d0]">
                  <span className="ms-pulse-dot relative inline-block h-1.5 w-1.5 rounded-full bg-[#0fb5a8]" />
                  Network Online
                </span>
              </div>
            </div>

            {/* Eyebrow */}
            <p
              className="ms-reveal ms-font-mono mt-7 text-[10.5px] tracking-[0.22em] uppercase text-[#0fb5a8]"
              style={{ animationDelay: '80ms' }}
            >
              {eyebrowText}
            </p>

            {/* Headline */}
            <h1
              className="ms-reveal ms-font-display mt-2 text-[32px] leading-[1.1] font-[300] text-[#0a1628] tracking-[-0.02em]"
              style={{ animationDelay: '160ms' }}
            >
              {headlineText.replace(headlineItalicWord, '')}
              <em className="italic text-[#0fb5a8]">{headlineItalicWord}</em>
            </h1>

            {/* Step indicator (hidden on success) */}
            {!redirectReady && (
              <div
                className="ms-reveal mt-5"
                style={{ animationDelay: '220ms' }}
              >
                <StepIndicator />
              </div>
            )}

            {/* Step content */}
            <div
              className="ms-reveal mt-5"
              style={{ animationDelay: '320ms' }}
            >
              <AnimatePresence mode="wait">
                {/* ── Step 1: Enter email/phone ───────────────── */}
                {step === 1 && !redirectReady && (
                  <motion.div
                    key="step-1"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[13px] leading-relaxed text-[#64748b]">
                      Enter your registered email or phone number to receive a 6-digit verification code.
                    </p>

                    <form
                      onSubmit={emailForm.handleSubmit(handleSendOtp)}
                      className="mt-5 space-y-4"
                      noValidate
                    >
                      <div className="ms-field">
                        <div className="ms-field-wrap relative flex h-[52px] items-center rounded-xl border border-[#e2e8f0] bg-white pl-11 pr-4 transition-colors">
                          <Mail className="ms-field-icon absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] transition-colors pointer-events-none" />
                          <Input
                            id="emailOrPhone"
                            type="text"
                            placeholder=" "
                            error={!!emailForm.formState.errors.emailOrPhone}
                            aria-invalid={!!emailForm.formState.errors.emailOrPhone}
                            aria-describedby={
                              emailForm.formState.errors.emailOrPhone
                                ? 'emailOrPhone-error'
                                : undefined
                            }
                            className="h-[52px] md:h-[52px] w-full !border-0 !shadow-none !bg-transparent !rounded-none pt-5 pb-1 px-0 text-[14px] text-[#0a1628] focus-visible:!border-0 focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:!outline-none"
                            {...emailForm.register('emailOrPhone')}
                          />
                          <Label
                            htmlFor="emailOrPhone"
                            className="absolute left-11 top-1/2 -translate-y-1/2 text-[13.5px] text-[#94a3b8] transition-all duration-200 pointer-events-none ms-font-body font-normal"
                          >
                            Email or phone
                          </Label>
                        </div>
                        {emailForm.formState.errors.emailOrPhone && (
                          <p
                            id="emailOrPhone-error"
                            className="mt-1 text-[11px] text-rose-600"
                            role="alert"
                          >
                            {emailForm.formState.errors.emailOrPhone.message}
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="ms-shine group relative flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0f1e35] to-[#0a1628] text-[14px] font-medium tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(10,22,40,0.6)] transition-all duration-200 hover:shadow-[0_16px_30px_-12px_rgba(10,22,40,0.7)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            <span>Sending…</span>
                          </>
                        ) : (
                          <>
                            <span>Send OTP</span>
                            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                          </>
                        )}
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* ── Step 2: Enter OTP ───────────────────────── */}
                {step === 2 && !redirectReady && (
                  <motion.div
                    key="step-2"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[13px] leading-relaxed text-[#64748b]">
                      Enter the 6-digit code sent to{' '}
                      <span className="ms-font-mono text-[#0a1628] font-medium">{savedContact}</span>
                    </p>

                    <div className="mt-6 space-y-4">
                      <div
                        className="flex justify-between gap-2"
                        role="group"
                        aria-label="One-time password"
                      >
                        {otp.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => {
                              otpRefs.current[index] = el
                            }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) =>
                              handleOtpChange(index, e.target.value)
                            }
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            onPaste={index === 0 ? handleOtpPaste : undefined}
                            className={cn(
                              'ms-otp-input h-14 w-12 rounded-xl border bg-white text-center text-[22px] font-[400] text-[#0a1628] shadow-sm transition-all duration-150',
                              'focus:outline-none',
                              digit ? 'border-[#0fb5a8]' : 'border-[#e2e8f0]',
                              otpError && 'border-rose-500',
                            )}
                            aria-label={`Digit ${index + 1}`}
                            disabled={isLoading}
                          />
                        ))}
                      </div>

                      {otpError && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-[12px] text-rose-600"
                          role="alert"
                        >
                          {otpError}
                        </motion.p>
                      )}

                      {isLoading && (
                        <div className="flex items-center justify-center gap-2 text-[12px] text-[#64748b]">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0fb5a8] border-t-transparent" />
                          Verifying…
                        </div>
                      )}

                      <div className="text-center">
                        {canResend ? (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            className="ms-link text-[12.5px] font-medium text-[#0a1628] hover:text-[#0fb5a8] cursor-pointer"
                          >
                            Resend OTP
                          </button>
                        ) : (
                          <p className="text-[12.5px] text-[#64748b]">
                            Resend code in{' '}
                            <span className="ms-font-mono font-medium text-[#0a1628]">
                              {resendTimer}s
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: New password ────────────────────── */}
                {step === 3 && !redirectReady && (
                  <motion.div
                    key="step-3"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[13px] leading-relaxed text-[#64748b]">
                      Pick a strong password — minimum 8 characters with at least one uppercase letter and one number.
                    </p>

                    <form
                      onSubmit={passwordForm.handleSubmit(handleResetPassword)}
                      className="mt-5 space-y-3"
                      noValidate
                    >
                      {/* New password */}
                      <div className="ms-field">
                        <div className="ms-field-wrap relative flex h-[52px] items-center rounded-xl border border-[#e2e8f0] bg-white pl-11 pr-12 transition-colors">
                          <Lock className="ms-field-icon absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] transition-colors pointer-events-none" />
                          <Input
                            id="newPassword"
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder=" "
                            error={!!passwordForm.formState.errors.newPassword}
                            aria-invalid={!!passwordForm.formState.errors.newPassword}
                            aria-describedby={
                              passwordForm.formState.errors.newPassword
                                ? 'newPassword-error'
                                : undefined
                            }
                            className="h-[52px] md:h-[52px] w-full !border-0 !shadow-none !bg-transparent !rounded-none pt-5 pb-1 px-0 text-[14px] text-[#0a1628] focus-visible:!border-0 focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:!outline-none"
                            {...passwordForm.register('newPassword')}
                          />
                          <Label
                            htmlFor="newPassword"
                            className="absolute left-11 top-1/2 -translate-y-1/2 text-[13.5px] text-[#94a3b8] transition-all duration-200 pointer-events-none ms-font-body font-normal"
                          >
                            New password
                          </Label>
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#0a1628] transition-colors cursor-pointer"
                            aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                            tabIndex={-1}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {passwordForm.formState.errors.newPassword && (
                          <p id="newPassword-error" className="mt-1 text-[11px] text-rose-600" role="alert">
                            {passwordForm.formState.errors.newPassword.message}
                          </p>
                        )}
                      </div>

                      {/* Confirm password */}
                      <div className="ms-field">
                        <div className="ms-field-wrap relative flex h-[52px] items-center rounded-xl border border-[#e2e8f0] bg-white pl-11 pr-12 transition-colors">
                          <Lock className="ms-field-icon absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] transition-colors pointer-events-none" />
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder=" "
                            error={!!passwordForm.formState.errors.confirmPassword}
                            aria-invalid={!!passwordForm.formState.errors.confirmPassword}
                            aria-describedby={
                              passwordForm.formState.errors.confirmPassword
                                ? 'confirmPassword-error'
                                : undefined
                            }
                            className="h-[52px] md:h-[52px] w-full !border-0 !shadow-none !bg-transparent !rounded-none pt-5 pb-1 px-0 text-[14px] text-[#0a1628] focus-visible:!border-0 focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:!outline-none"
                            {...passwordForm.register('confirmPassword')}
                          />
                          <Label
                            htmlFor="confirmPassword"
                            className="absolute left-11 top-1/2 -translate-y-1/2 text-[13.5px] text-[#94a3b8] transition-all duration-200 pointer-events-none ms-font-body font-normal"
                          >
                            Confirm password
                          </Label>
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#0a1628] transition-colors cursor-pointer"
                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {passwordForm.formState.errors.confirmPassword && (
                          <p id="confirmPassword-error" className="mt-1 text-[11px] text-rose-600" role="alert">
                            {passwordForm.formState.errors.confirmPassword.message}
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="ms-shine group relative flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0f1e35] to-[#0a1628] text-[14px] font-medium tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(10,22,40,0.6)] transition-all duration-200 hover:shadow-[0_16px_30px_-12px_rgba(10,22,40,0.7)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            <span>Resetting…</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" />
                            <span>Reset Password</span>
                          </>
                        )}
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* ── Success state ───────────────────────────── */}
                {redirectReady && (
                  <motion.div
                    key="success"
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[13px] leading-relaxed text-[#64748b]">
                      Your password has been updated. You can now sign in to your account with your new credentials.
                    </p>

                    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0fb5a8] shadow-[0_4px_12px_-4px_rgba(15,181,168,0.6)]">
                        <CheckCircle2 className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[#047857]">Password reset complete</p>
                        <p className="text-[11.5px] text-[#0fb5a8]">All sessions have been refreshed for security.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onBackToLogin}
                      className="ms-shine group relative mt-5 flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0f1e35] to-[#0a1628] text-[14px] font-medium tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(10,22,40,0.6)] transition-all duration-200 hover:shadow-[0_16px_30px_-12px_rgba(10,22,40,0.7)] cursor-pointer"
                    >
                      <span>Back to Sign In</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Back to login link (hidden on success) */}
            {!redirectReady && (
              <div className="ms-reveal mt-5 text-center" style={{ animationDelay: '400ms' }}>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#475569] hover:text-[#0a1628] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Login
                </button>
              </div>
            )}

            {/* Footer row */}
            <div
              className="ms-reveal mt-7 flex items-center justify-between gap-2"
              style={{ animationDelay: '480ms' }}
            >
              <p className="ms-font-mono text-[10px] tracking-[0.16em] uppercase text-[#94a3b8]">
                Secure recovery flow
              </p>
              <div className="flex items-center gap-1.5">
                {['HIPAA', 'ISO 27001', 'SOC 2'].map((tag) => (
                  <span
                    key={tag}
                    className="ms-font-mono inline-flex items-center rounded-md border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[#475569]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── RIGHT PANEL — HERO ──────────────────────────────────── */}
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
                <ShieldCheck className="h-3 w-3" />
                Secure Recovery
              </span>
              <span className="ms-font-mono rounded-md border border-[rgba(230,237,247,0.15)] bg-[rgba(230,237,247,0.04)] px-2 py-1 text-[10px] tracking-[0.14em] text-[rgba(230,237,247,0.62)]">
                E2E ENCRYPTED
              </span>
            </div>

            {/* Headline + paragraph */}
            <div className="mt-6 max-w-[560px]">
              <h2 className="ms-font-display text-[40px] leading-[1.05] font-[300] tracking-[-0.02em]">
                Your account, recovered{' '}
                <em
                  className="italic"
                  style={{
                    background: 'linear-gradient(90deg, #a7f3d0 0%, #22d3c5 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  safely.
                </em>
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[rgba(230,237,247,0.7)] max-w-[480px]">
                One-time codes, audit-logged sessions and zero-knowledge password storage —
                everything wired with the same security stack hospitals trust.
              </p>
            </div>

            {/* ─── 3D-style Vault & OTP illustration ────────────── */}
            <div className="relative mx-auto my-4 flex flex-1 w-full max-w-[560px] items-center justify-center">
              <svg viewBox="0 0 600 460" className="h-full w-full" style={{ filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.45))' }}>
                <defs>
                  {/* Shield gradients */}
                  <linearGradient id="shieldFront" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#22d3c5" />
                    <stop offset="1" stopColor="#0fb5a8" />
                  </linearGradient>
                  <linearGradient id="shieldTop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5eead4" />
                    <stop offset="1" stopColor="#22d3c5" />
                  </linearGradient>
                  <linearGradient id="shieldSide" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#0fb5a8" />
                    <stop offset="1" stopColor="#065f5b" />
                  </linearGradient>

                  {/* Card surface */}
                  <linearGradient id="cardSurface" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
                    <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
                  </linearGradient>
                  <linearGradient id="cardSurface2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(34,211,197,0.12)" />
                    <stop offset="1" stopColor="rgba(99,102,241,0.06)" />
                  </linearGradient>

                  {/* Flow line */}
                  <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="rgba(34,211,197,0)" />
                    <stop offset="0.5" stopColor="rgba(34,211,197,0.9)" />
                    <stop offset="1" stopColor="rgba(34,211,197,0)" />
                  </linearGradient>

                  {/* Core glow */}
                  <radialGradient id="coreGlow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="rgba(34,211,197,0.55)" />
                    <stop offset="1" stopColor="rgba(34,211,197,0)" />
                  </radialGradient>

                  {/* Key gradient */}
                  <linearGradient id="keyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fcd34d" />
                    <stop offset="1" stopColor="#f59e0b" />
                  </linearGradient>

                  {/* Sparkle */}
                  <radialGradient id="sparkle" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
                    <stop offset="1" stopColor="rgba(255,255,255,0)" />
                  </radialGradient>
                </defs>

                {/* Core radial glow */}
                <circle cx="300" cy="240" r="170" fill="url(#coreGlow)" />

                {/* Orbiting dashed rings */}
                <g className="ms-spin-slow" style={{ transformOrigin: '300px 240px' }}>
                  <ellipse cx="300" cy="240" rx="220" ry="80" fill="none" stroke="rgba(34,211,197,0.18)" strokeWidth="1" strokeDasharray="3 7" />
                </g>
                <g className="ms-spin-rev" style={{ transformOrigin: '300px 240px' }}>
                  <ellipse cx="300" cy="240" rx="180" ry="140" fill="none" stroke="rgba(99,102,241,0.18)" strokeWidth="1" strokeDasharray="2 6" />
                </g>

                {/* Pulsing concentric rings */}
                <g style={{ transformOrigin: '300px 240px' }}>
                  <circle className="ms-ring-pulse" cx="300" cy="240" r="70" fill="none" stroke="rgba(34,211,197,0.45)" strokeWidth="1.5" />
                  <circle className="ms-ring-pulse" cx="300" cy="240" r="70" fill="none" stroke="rgba(34,211,197,0.3)" strokeWidth="1.2" style={{ animationDelay: '1.5s' }} />
                </g>

                {/* Flow lines from OTP cards to shield */}
                <g fill="none" strokeWidth="1.6">
                  <path className="ms-flow" d="M 120 130 Q 220 200 280 230" stroke="url(#flowGrad)" />
                  <path className="ms-flow" d="M 480 130 Q 380 200 320 230" stroke="url(#flowGrad)" style={{ animationDelay: '1.2s' }} />
                  <path className="ms-flow" d="M 100 360 Q 200 320 270 270" stroke="url(#flowGrad)" style={{ animationDelay: '0.6s' }} />
                  <path className="ms-flow" d="M 500 360 Q 400 320 330 270" stroke="url(#flowGrad)" style={{ animationDelay: '1.8s' }} />
                </g>

                {/* Ground shadow */}
                <ellipse cx="300" cy="370" rx="110" ry="14" fill="rgba(0,0,0,0.5)" opacity="0.5" />

                {/* ─── Central 3D Shield with keyhole ─────────── */}
                <g className="ms-floatY-slow" style={{ transformOrigin: '300px 240px' }}>
                  {/* Shield side face (depth) */}
                  <path
                    d="M 340 170 L 360 154 L 360 280 Q 360 326 300 354 L 280 338 Q 340 312 340 280 Z"
                    fill="url(#shieldSide)"
                  />
                  {/* Shield top edge */}
                  <path
                    d="M 240 170 L 260 154 L 360 154 L 340 170 Z"
                    fill="url(#shieldTop)"
                  />
                  {/* Shield front face */}
                  <path
                    d="M 240 170 L 340 170 L 340 280 Q 340 322 290 350 L 290 350 Q 240 322 240 280 Z"
                    fill="url(#shieldFront)"
                  />
                  {/* Shield highlight */}
                  <path
                    d="M 240 170 L 340 170 L 340 280 Q 340 322 290 350 L 290 350 Q 240 322 240 280 Z"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1.2"
                  />
                  {/* Inner gleam line */}
                  <path d="M 252 178 L 332 178" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />

                  {/* Keyhole */}
                  <circle cx="290" cy="234" r="14" fill="#0a1628" />
                  <path d="M 290 242 L 290 274" stroke="#0a1628" strokeWidth="8" strokeLinecap="round" />

                  {/* Check mark badge floating on shield (verified) */}
                  <g transform="translate(310 200)">
                    <circle r="13" fill="#ffffff" />
                    <path d="M -5 1 L -1 5 L 6 -3" stroke="#0fb5a8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </g>
                </g>

                {/* ─── Floating Key (top right of shield) ─── */}
                <g className="ms-floatY" style={{ transformOrigin: '420px 200px', animationDelay: '1.4s' }}>
                  <g className="ms-key" transform="translate(390 175)">
                    {/* key head */}
                    <circle cx="0" cy="0" r="16" fill="url(#keyGrad)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                    <circle cx="0" cy="0" r="6" fill="#0a1628" />
                    {/* key shaft */}
                    <rect x="14" y="-3" width="40" height="6" rx="1.5" fill="url(#keyGrad)" />
                    {/* teeth */}
                    <rect x="44" y="3" width="4" height="6" fill="url(#keyGrad)" />
                    <rect x="38" y="3" width="3" height="4" fill="url(#keyGrad)" />
                    {/* highlight */}
                    <circle cx="-4" cy="-4" r="3" fill="rgba(255,255,255,0.5)" />
                  </g>
                </g>

                {/* ─── Floating envelope (top left) ─── */}
                <g className="ms-floatY" style={{ transformOrigin: '130px 130px' }}>
                  <g transform="translate(60 80) skewY(-6)">
                    <rect width="140" height="86" rx="10" fill="url(#cardSurface)" stroke="rgba(34,211,197,0.4)" strokeWidth="1" />
                    <rect width="140" height="86" rx="10" fill="url(#cardSurface2)" opacity="0.5" />
                    {/* envelope flap */}
                    <path d="M 0 0 L 70 50 L 140 0" fill="none" stroke="rgba(34,211,197,0.5)" strokeWidth="1.5" />
                    {/* envelope body labels */}
                    <text x="14" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="2">CODE SENT</text>
                    <text x="14" y="70" fill="rgba(230,237,247,0.6)" fontFamily="Outfit, sans-serif" fontSize="9">via secure channel</text>
                    {/* Stamp circle */}
                    <circle cx="120" cy="20" r="6" fill="rgba(34,211,197,0.2)" stroke="#22d3c5" strokeWidth="1" />
                    <path d="M 117 20 L 119 22 L 123 18" stroke="#22d3c5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                  </g>
                </g>

                {/* ─── Floating OTP code card (top right) ─── */}
                <g className="ms-floatY" style={{ transformOrigin: '470px 100px', animationDelay: '1.3s' }}>
                  <g transform="translate(390 60) skewY(6)">
                    <rect width="180" height="60" rx="10" fill="url(#cardSurface)" stroke="rgba(99,102,241,0.45)" strokeWidth="1" />
                    <rect width="180" height="60" rx="10" fill="url(#cardSurface2)" opacity="0.5" />
                    <text x="14" y="16" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="2">OTP · 60s</text>
                    {/* 6 boxes */}
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <g key={i} transform={`translate(${14 + i * 26} 24)`}>
                        <rect width="22" height="28" rx="4" fill="rgba(255,255,255,0.06)" stroke="rgba(34,211,197,0.4)" strokeWidth="1" />
                        <text x="11" y="20" textAnchor="middle" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="16">{['4', '2', '8', '·', '·', '·'][i]}</text>
                      </g>
                    ))}
                  </g>
                </g>

                {/* ─── Floating verification badge (bottom left) ─── */}
                <g className="ms-floatY-slow" style={{ transformOrigin: '110px 360px', animationDelay: '0.7s' }}>
                  <g transform="translate(20 320) skewY(4)">
                    <rect width="170" height="80" rx="12" fill="url(#cardSurface)" stroke="rgba(34,211,197,0.4)" strokeWidth="1" />
                    <rect width="170" height="80" rx="12" fill="url(#cardSurface2)" opacity="0.5" />
                    <circle cx="16" cy="16" r="3" fill="#22d3c5" />
                    <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">DEVICE TRUSTED</text>
                    <text x="16" y="42" fill="#e6edf7" fontFamily="Fraunces, serif" fontSize="20" fontWeight="400">Chrome · macOS</text>
                    <text x="16" y="60" fill="rgba(230,237,247,0.55)" fontFamily="Outfit, sans-serif" fontSize="9">verified · Madurai, IN</text>
                    {/* Check */}
                    <g transform="translate(146 30)">
                      <circle r="12" fill="#0fb5a8" />
                      <path d="M -4 0 L -1 3 L 5 -3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </g>
                  </g>
                </g>

                {/* ─── Floating audit log (bottom right) ─── */}
                <g className="ms-floatY" style={{ transformOrigin: '490px 360px', animationDelay: '2.1s' }}>
                  <g transform="translate(410 320) skewY(-4)">
                    <rect width="170" height="80" rx="12" fill="url(#cardSurface)" stroke="rgba(99,102,241,0.4)" strokeWidth="1" />
                    <rect width="170" height="80" rx="12" fill="url(#cardSurface2)" opacity="0.5" />
                    <circle cx="16" cy="16" r="3" fill="#a7f3d0" />
                    <text x="26" y="20" fill="#a7f3d0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2">AUDIT LOG</text>
                    {/* log lines */}
                    {[0, 1, 2].map((i) => (
                      <g key={i} transform={`translate(16 ${32 + i * 14})`}>
                        <rect width="6" height="6" rx="1.5" fill={i === 0 ? '#22d3c5' : 'rgba(230,237,247,0.3)'} />
                        <rect x="12" y="1" width={[100, 80, 90][i]} height="4" rx="2" fill="rgba(230,237,247,0.15)" />
                      </g>
                    ))}
                  </g>
                </g>

                {/* Sparkle particles */}
                {[
                  { cx: 230, cy: 110, r: 18, d: '0s' },
                  { cx: 420, cy: 90, r: 14, d: '1.2s' },
                  { cx: 100, cy: 250, r: 12, d: '2s' },
                  { cx: 510, cy: 260, r: 16, d: '0.6s' },
                  { cx: 280, cy: 420, r: 12, d: '1.6s' },
                  { cx: 350, cy: 60, r: 10, d: '2.4s' },
                ].map((p, i) => (
                  <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="url(#sparkle)" opacity="0.6">
                    <animate attributeName="opacity" values="0.2;0.7;0.2" dur="3s" begin={p.d} repeatCount="indefinite" />
                  </circle>
                ))}
              </svg>
            </div>

            {/* Bottom strip */}
            <div className="mt-auto">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <div className="ms-font-display italic text-[36px] font-[400] leading-none text-[#22d3c5]">100%</div>
                  <div className="mt-1 text-[12px] text-[rgba(230,237,247,0.7)]">
                    encrypted recovery flow · session-aware · audit-logged
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
      </div>
    </>
  )
}
