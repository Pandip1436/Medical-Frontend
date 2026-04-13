import { useState, useRef, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Mail,
  ArrowLeft,
  Pill,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import AuthLayout from '@/components/layout/AuthLayout'
import { cn } from '@/lib/utils'

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

const MOCK_OTP = '123456'
const RESEND_COOLDOWN = 60

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
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
    await new Promise((resolve) => setTimeout(resolve, 800))
    setSavedContact(data.emailOrPhone)
    toast.success('OTP sent successfully!', {
      description: `A 6-digit code has been sent to ${data.emailOrPhone}`,
    })
    setStep(2)
    setIsLoading(false)
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

    if (code === MOCK_OTP) {
      toast.success('OTP verified successfully!')
      setStep(3)
    } else {
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

  const handleResetPassword = async (_data: PasswordFormData) => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    toast.success('Password reset successfully!', {
      description: 'You can now sign in with your new password.',
    })
    setRedirectReady(true)
    setIsLoading(false)
  }

  // ── Step indicator ──────────────────────────────────────────

  const StepIndicator = () => (
    <div className="mb-6 flex items-center justify-center gap-0">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300',
                step >= s
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                  : 'bg-muted text-muted-foreground'
              )}
              aria-label={`Step ${s}${step === s ? ' (current)' : ''}`}
              aria-current={step === s ? 'step' : undefined}
            >
              {step > s ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                s
              )}
            </div>
            <span className="text-[9px] font-medium text-muted-foreground">
              {stepLabels[i]}
            </span>
          </div>
          {i < 2 && (
            <div
              className={cn(
                'h-0.5 w-10 mb-4 transition-colors duration-300',
                step > s ? 'bg-primary' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )

  // ── Render ──────────────────────────────────────────────────

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border-0 bg-gradient-to-b from-secondary/95 to-primary/30 shadow-2xl backdrop-blur-xl dark:from-surface/95 dark:to-primary/30">
          <CardHeader className="space-y-4 pb-2 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                <Pill className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Reset Password
              </h1>
            </div>

            <StepIndicator />
          </CardHeader>

          <CardContent className="pb-6">
            <AnimatePresence mode="wait">
              {/* ── Step 1: Enter email/phone ───────────────── */}
              {step === 1 && (
                <motion.div
                  key="step-1"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                >
                  <p className="mb-4 text-center text-sm text-muted-foreground">
                    Enter your registered email or phone number to receive a
                    verification code.
                  </p>

                  <form
                    onSubmit={emailForm.handleSubmit(handleSendOtp)}
                    className="space-y-4"
                    noValidate
                  >
                    <div className="space-y-2">
                      <Label htmlFor="emailOrPhone" className="text-xs font-medium">
                        Email or Phone
                      </Label>
                      <Input
                        id="emailOrPhone"
                        type="text"
                        placeholder="you@example.com or 9876543210"
                        icon={<Mail className="h-4 w-4 text-black/60" />}
                        error={!!emailForm.formState.errors.emailOrPhone}
                        aria-invalid={!!emailForm.formState.errors.emailOrPhone}
                        aria-describedby={
                          emailForm.formState.errors.emailOrPhone
                            ? 'emailOrPhone-error'
                            : undefined
                        }
                        className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus-within:border-black/40"
                        {...emailForm.register('emailOrPhone')}
                      />
                      {emailForm.formState.errors.emailOrPhone && (
                        <p
                          id="emailOrPhone-error"
                          className="text-[11px] text-rose-600 dark:text-rose-400"
                          role="alert"
                        >
                          {emailForm.formState.errors.emailOrPhone.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full cursor-pointer"
                      size="lg"
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Send OTP
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* ── Step 2: Enter OTP ───────────────────────── */}
              {step === 2 && (
                <motion.div
                  key="step-2"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                >
                  <p className="mb-1 text-center text-sm text-muted-foreground">
                    Enter the 6-digit code sent to
                  </p>
                  <p className="mb-4 text-center text-sm font-medium text-foreground">
                    {savedContact}
                  </p>

                  <div className="space-y-4">
                    <div
                      className="flex justify-center gap-2"
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
                            'h-12 w-11 rounded-xl border bg-black/5 text-center text-lg font-bold text-black shadow-sm transition-all duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40',
                            digit ? 'border-primary/50' : 'border-black/20',
                            otpError && 'border-destructive animate-shake'
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
                        className="text-center text-[11px] text-rose-600 dark:text-rose-400"
                        role="alert"
                      >
                        {otpError}
                      </motion.p>
                    )}

                    {isLoading && (
                      <div className="flex justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    )}

                    <div className="text-center">
                      {canResend ? (
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          className="text-xs font-bold text-black hover:underline"
                        >
                          Resend OTP
                        </button>
                      ) : (
                        <p className="text-xs font-medium text-black">
                          Resend code in{' '}
                          <span className="font-mono font-bold text-black">
                            {resendTimer}s
                          </span>
                        </p>
                      )}
                    </div>

                    <p className="text-center text-[10px] font-medium text-black/60">
                      Mock OTP: 123456
                    </p>
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
                  <p className="mb-4 text-center text-sm text-muted-foreground">
                    Create a new password for your account.
                  </p>

                  <form
                    onSubmit={passwordForm.handleSubmit(handleResetPassword)}
                    className="space-y-4"
                    noValidate
                  >
                    <div className="space-y-2">
                      <Label htmlFor="newPassword" className="text-xs font-medium">
                        New Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Min 8 chars, 1 uppercase, 1 number"
                          icon={<Lock className="h-4 w-4 text-black/60" />}
                          error={!!passwordForm.formState.errors.newPassword}
                          className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus-within:border-black/40 pr-10"
                          aria-invalid={!!passwordForm.formState.errors.newPassword}
                          aria-describedby={
                            passwordForm.formState.errors.newPassword
                              ? 'newPassword-error'
                              : undefined
                          }
                          {...passwordForm.register('newPassword')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 transition-colors hover:text-black"
                          aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                          tabIndex={-1}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordForm.formState.errors.newPassword && (
                        <p id="newPassword-error" className="text-[11px] text-rose-600 dark:text-rose-400" role="alert">
                          {passwordForm.formState.errors.newPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-xs font-medium">
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Re-enter your new password"
                          icon={<Lock className="h-4 w-4 text-black/60" />}
                          error={!!passwordForm.formState.errors.confirmPassword}
                          className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus-within:border-black/40 pr-10"
                          aria-invalid={!!passwordForm.formState.errors.confirmPassword}
                          aria-describedby={
                            passwordForm.formState.errors.confirmPassword
                              ? 'confirmPassword-error'
                              : undefined
                          }
                          {...passwordForm.register('confirmPassword')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 transition-colors hover:text-black"
                          aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordForm.formState.errors.confirmPassword && (
                        <p id="confirmPassword-error" className="text-[11px] text-rose-600 dark:text-rose-400" role="alert">
                          {passwordForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Reset Password
                    </Button>
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
                  className="flex flex-col items-center gap-4 py-4"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold text-foreground">
                      Password Reset Complete
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your password has been updated successfully.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={onBackToLogin}
                  >
                    Back to Sign In
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {!redirectReady && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-black transition-colors hover:opacity-80"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-black" />
                  Back to Login
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AuthLayout>
  )
}
