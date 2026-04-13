import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, Pill } from 'lucide-react'
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
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginPageProps {
  onForgotPassword?: () => void
  onLoginSuccess?: () => void
}

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

  const login = useAuthStore((s) => s.login)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormData) => {
    setLoginError('')
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const success = await login(data.email, data.password)

    if (success) {
      setLoginSucceeded(true)
      onLoginSuccess?.()
    } else {
      setLoginError(
        'Invalid credentials. Please check your email and password.',
      )
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
        <Card className="border-0 bg-gradient-to-b from-secondary/95 to-primary/30 shadow-2xl backdrop-blur-xl dark:from-surface/95 dark:to-primary/30">
          <CardHeader className="space-y-4 pb-4 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
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

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
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
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 cursor-pointer" />
                    ) : (
                      <Eye className="h-4 w-4 cursor-pointer" />
                    )}
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
                    onCheckedChange={(checked) =>
                      setRememberMe(checked === true)
                    }
                    aria-label="Remember me"
                    className='cursor-pointer'
                  />
                  <Label
                    htmlFor="remember"
                    className="cursor-pointer text-xs font-normal"
                  >
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
            <div className="w-full border-t border-black/10 pt-4">
              <p className="text-center text-[10px] font-bold uppercase tracking-wider text-black">
                Test Accounts
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] text-black">
                <div className="rounded-lg bg-black/5 px-2.5 py-1.5">
                  <span className="font-bold text-black">Admin</span>
                  <p className="text-[10px] mt-0.5 text-black/80">admin@hospitalsuppliers.com</p>
                  <p className="text-[10px] font-mono text-black/80">Admin@123</p>
                </div>
                <div className="rounded-lg bg-black/5 px-2.5 py-1.5">
                  <span className="font-bold text-black">Pharmacist</span>
                  <p className="text-[10px] mt-0.5 text-black/80">ravi@hospitalsuppliers.com</p>
                  <p className="text-[10px] font-mono text-black/80">Pharma@123</p>
                </div>
                <div className="rounded-lg bg-black/5 px-2.5 py-1.5">
                  <span className="font-bold text-black">Inventory</span>
                  <p className="text-[10px] mt-0.5 text-black/80">kumar@hospitalsuppliers.com</p>
                  <p className="text-[10px] font-mono text-black/80">Stock@123</p>
                </div>
                <div className="rounded-lg bg-black/5 px-2.5 py-1.5">
                  <span className="font-bold text-black">Accountant</span>
                  <p className="text-[10px] mt-0.5 text-black/80">priya@hospitalsuppliers.com</p>
                  <p className="text-[10px] font-mono text-black/80">Account@123</p>
                </div>
              </div>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </AuthLayout>
  )
}
