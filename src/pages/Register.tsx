import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Studio or photographer name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      setServerError(null);
      await registerAuth({
        name: data.name,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });

      setRegisteredSuccess(true);
      success(
        'Studio Registered Successfully',
        'Account created with pending status. Please log in with your email and password, then enter your 6-digit login OTP.'
      );

      // Brief delay to allow viewing the confirmation card before navigating to login
      setTimeout(() => {
        navigate('/login', { state: { registeredEmail: data.email } });
      }, 2000);
    } catch (err: any) {
      const msg = err.message || 'Registration failed. Please check your information and try again.';
      setServerError(msg);
      showError('Registration Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shadow-md mb-4">
          <Camera className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">
          Create Studio Account
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Join <span className="font-medium text-stone-900">Penta Prizm</span> · AI-powered wedding galleries
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#ECE5D8] rounded-2xl shadow-sm">
          {registeredSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-stone-900">Registration Successful!</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Your studio account has been registered with pending verification. Redirecting you to login to complete verification with your 6-digit login OTP...
              </p>
              <div className="pt-2">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => navigate('/login')}
                >
                  Proceed to Login &rarr;
                </Button>
              </div>
            </div>
          ) : (
            <>
              {serverError && (
                <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Photographer / Studio Name"
                  type="text"
                  placeholder="e.g. Vance Wedding Photography"
                  leftIcon={<UserIcon className="w-4 h-4" />}
                  error={errors.name?.message}
                  required
                  {...register('name')}
                />

                <Input
                  label="Studio Email Address"
                  type="email"
                  autoComplete="email"
                  placeholder="studio@weddinglens.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                  error={errors.email?.message}
                  required
                  {...register('email')}
                />

                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters (letters + numbers)"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={errors.password?.message}
                  required
                  {...register('password')}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={errors.confirmPassword?.message}
                  required
                  {...register('confirmPassword')}
                />

                <div className="p-3 bg-[#FDFBF7] border border-[#ECE5D8] rounded-xl flex items-center gap-2.5 text-[11px] text-stone-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Passwords securely hashed using one-way cryptographic bcrypt.</span>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-2"
                  isLoading={isLoading}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Register Studio Account
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-stone-100 text-center">
                <p className="text-xs text-stone-600">
                  Already registered your studio?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-stone-900 hover:text-[#9C7D4F] underline underline-offset-4"
                  >
                    Sign in here
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
