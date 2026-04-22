import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, Pill, ChevronDown, Sparkles, Shield, FlaskConical, Package, Calculator, UserCheck } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import AuthLayout from '@/components/layout/AuthLayout'

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
    name: 'Arjun Sales',
    email: 'salesperson@pbims.com',
    password: 'sales123',
    icon: UserCheck,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    description: 'Sales & customers view',
  },
]

export default function LoginPage({
  onForgotPassword,
  onLoginSuccess,
}: LoginPageProps) {
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDemoOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fillDemo = (account: typeof demoAccounts[0]) => {
    setValue('email', account.email, { shouldValidate: true })
    setValue('password', account.password, { shouldValidate: true })
    setLoginError('')
    setDemoOpen(false)
  }

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
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          x: shake ? [0, -10, 10, -10, 10, -5, 5, 0] : 0,
        }}
        transition={{
          opacity: { duration: 0.5 },
          y: { duration: 0.5 },
          scale: { duration: 0.5 },
          x: { duration: 0.5, ease: 'easeInOut' },
        }}
      >
        <Card className="border-0 bg-linear-to-b from-secondary/95 to-primary/30 shadow-2xl backdrop-blur-xl dark:from-surface/95 dark:to-primary/30">
          <CardHeader className="space-y-4 pb-4 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                <Pill className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Hospital Suppliers
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pharma Billing &amp; Inventory Management
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loginError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-center text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400"
                role="alert"
              >
                {loginError}
              </motion.div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  icon={<Mail className="h-4 w-4 text-black/60" />}
                  error={!!errors.email}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus-within:border-black/40"
                  {...register('email')}
                />
                {errors.email && (
                  <p id="email-error" className="text-[11px] text-rose-600 dark:text-rose-400" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    icon={<Lock className="h-4 w-4 text-black/60" />}
                    error={!!errors.password}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    className="border-black/20 bg-black/5 text-black placeholder:text-black/40 focus-within:border-black/40 pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 transition-colors hover:text-black"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 cursor-pointer" /> : <Eye className="h-4 w-4 cursor-pointer" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="text-[11px] text-rose-600 dark:text-rose-400" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    aria-label="Remember me"
                    className='cursor-pointer'
                  />
                  <Label htmlFor="remember" className="cursor-pointer text-xs font-normal">
                    Remember me
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="cursor-pointer text-xs font-bold text-black/70 hover:text-black hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full cursor-pointer"
                size="lg"
                loading={isLoading}
                disabled={isLoading || loginSucceeded}
              >
                {loginSucceeded ? 'Signed In' : 'Sign In'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex-col gap-2 pb-6">
            <div className="w-full border-t border-border/40 pt-4">
              {/* Demo Login Button */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  id="demo-login-btn"
                  onClick={() => setDemoOpen((v) => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/30 bg-foreground/5 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-foreground/10 hover:border-foreground/50"
                >
                  <Sparkles className="h-4 w-4" />
                  Demo Login
                  <ChevronDown
                    className={`ml-auto h-4 w-4 transition-transform duration-200 ${demoOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {demoOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-2xl shadow-black/10"
                    >
                      <div className="p-2 space-y-1">
                        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Select a demo account
                        </p>
                        {demoAccounts.map((account) => {
                          const Icon = account.icon
                          return (
                            <button
                              key={account.role}
                              type="button"
                              onClick={() => fillDemo(account)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01] ${account.bg}`}
                            >
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/5 shadow-sm`}>
                                <Icon className={`h-4 w-4 ${account.color}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">{account.name}</span>
                                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${account.badge}`}>
                                    {account.role}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
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

              <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
                Credentials auto-fill on selection
              </p>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </AuthLayout>
  )
}
