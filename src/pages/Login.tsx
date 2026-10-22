import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Lock, Mail, ArrowRight, KeyRound, ShieldAlert, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const { login, verifyLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Step 2 OTP State
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP'>('CREDENTIALS');
  const [preAuthToken, setPreAuthToken] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const defaultEmail = (location.state as any)?.registeredEmail || '';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: defaultEmail,
    },
  });

  useEffect(() => {
    if (defaultEmail) {
      setValue('email', defaultEmail);
    }
  }, [defaultEmail, setValue]);

  // Focus first OTP input when step changes to OTP
  useEffect(() => {
    if (step === 'OTP' && otpInputsRef.current[0]) {
      otpInputsRef.current[0]?.focus();
    }
  }, [step]);

  // Step 1: Submit Credentials
  const onCredentialsSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      setServerError(null);

      const res = await login({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      if (res.requiresOtp && res.preAuthToken) {
        setPreAuthToken(res.preAuthToken);
        setTargetEmail(res.email);
        setStep('OTP');
        setOtpDigits(['', '', '', '', '', '']);
        setOtpError(null);
        success('Credentials Verified', 'Please enter your 6-digit login verification OTP.');
      } else {
        // Fallback for direct session if any
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please verify your credentials.';
      setServerError(msg);
      showError('Authentication Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP Slot Input Change
  const handleOtpChange = (index: number, value: string) => {
    // Only accept numeric characters
    const sanitized = value.replace(/\D/g, '');
    if (!sanitized && value !== '') return;

    const newDigits = [...otpDigits];
    newDigits[index] = sanitized.slice(-1); // Only take latest char
    setOtpDigits(newDigits);
    setOtpError(null);

    // Auto-advance to next input if filled
    if (sanitized && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle Backspace navigation
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
      }
    }
  };

  // Handle Paste Event
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    setOtpError(null);

    const nextIndex = Math.min(pasted.length, 5);
    otpInputsRef.current[nextIndex]?.focus();
  };

  // Step 2: Submit OTP
  const onOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }

    try {
      setIsVerifyingOtp(true);
      setOtpError(null);

      await verifyLoginOtp({
        preAuthToken,
        otp: fullOtp,
      });

      success('Welcome Back!', 'Login OTP verified successfully. Welcome to your studio portal.');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.message || 'Verification failed. Please check your OTP.';
      setOtpError(msg);
      showError('Verification Failed', msg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shadow-md mb-4">
          <Camera className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">
          Photographer Portal
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Sign in to manage your wedding events and guest galleries
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#ECE5D8] rounded-2xl shadow-sm">
          {step === 'CREDENTIALS' ? (
            <>
              {serverError && (
                <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onCredentialsSubmit)} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  autoComplete="email"
                  placeholder="photographer@studio.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                  error={errors.email?.message}
                  required
                  {...register('email')}
                />

                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={errors.password?.message}
                  required
                  {...register('password')}
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-2"
                  isLoading={isLoading}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Continue to Verification &rarr;
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-stone-100 text-center">
                <p className="text-xs text-stone-600">
                  New wedding photographer?{' '}
                  <Link
                    to="/register"
                    className="font-semibold text-stone-900 hover:text-[#9C7D4F] underline underline-offset-4"
                  >
                    Register an account
                  </Link>
                </p>
              </div>
            </>
          ) : (
            /* STEP 2: SIX-DIGIT LOGIN OTP VERIFICATION */
            <div>
              <div className="mb-5 text-center">
                <div className="w-10 h-10 rounded-full bg-[#FAF8F5] border border-[#ECE5D8] text-[#9C7D4F] flex items-center justify-center mx-auto mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-stone-900">
                  Two-Step OTP Verification
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Enter the 6-digit login OTP assigned to <span className="font-semibold text-stone-900">{targetEmail}</span> by your Super Admin.
                </p>
              </div>

              {otpError && (
                <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{otpError}</span>
                </div>
              )}

              <form onSubmit={onOtpSubmit} className="space-y-5">
                <div className="flex justify-center gap-2 sm:gap-2.5">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold font-mono bg-[#FAF8F5] border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A880] focus:border-[#9C7D4F] text-stone-900 transition-all shadow-inner"
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>

                <div className="p-3 bg-[#FAF8F5] border border-[#EADBCE] rounded-xl text-[11px] text-stone-600 space-y-1">
                  <p className="font-medium text-stone-800">
                    ℹ️ Need your login OTP?
                  </p>
                  <p className="leading-relaxed">
                    Contact your Penta Prizm Super Admin. They can generate a single-use 6-digit login code valid for 5 minutes from the administrator directory.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  isLoading={isVerifyingOtp}
                  disabled={otpDigits.join('').length !== 6}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Verify Code & Enter Studio
                </Button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('CREDENTIALS');
                      setServerError(null);
                      setOtpError(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to email & password
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Security badge */}
        <p className="text-center text-[11px] text-stone-400 mt-6">
          Protected with Super Admin-controlled single-use OTPs & rate limiting
        </p>
      </div>
    </div>
  );
}
