import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
    activationCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Activation code must be a 6-digit number'),
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
  const [searchParams] = useSearchParams();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const queryCode = searchParams.get('code') || '';
  const queryEmail = searchParams.get('email') || '';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      activationCode: queryCode,
      email: queryEmail,
    },
  });

  useEffect(() => {
    if (queryCode) setValue('activationCode', queryCode);
    if (queryEmail) setValue('email', queryEmail);
  }, [queryCode, queryEmail, setValue]);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      setServerError(null);
      await registerAuth(data);
      success('Studio Registered', 'Welcome to Penta Prizm! Your wedding photographer account is ready.');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.message || 'Registration failed. Please verify your invitation code.';
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
          Activate Studio Account
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Powered by <span className="font-medium text-stone-900">Penta Prizm</span> · Invitation required
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#ECE5D8] rounded-2xl shadow-sm">
          {serverError && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
              {serverError}
            </div>
          )}

          <div className="mb-5 p-3.5 bg-[#FBF9F4] border border-[#EADBCE] rounded-xl flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-[#9C7D4F] shrink-0 mt-0.5" />
            <p className="text-xs text-stone-700 leading-relaxed">
              Enter your invited studio email address and the <strong>6-digit activation code</strong> provided by Penta Prizm.
            </p>
          </div>

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
              label="Invited Email Address"
              type="email"
              autoComplete="email"
              placeholder="studio@weddinglens.com"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              required
              {...register('email')}
            />

            <Input
              label="6-Digit Activation Code"
              type="text"
              maxLength={6}
              placeholder="123456"
              leftIcon={<KeyRound className="w-4 h-4" />}
              error={errors.activationCode?.message}
              helperText="Generated securely by Penta Prizm administrators"
              required
              {...register('activationCode')}
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
              <span>Activation code securely validated against one-way cryptographic hash.</span>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Activate Studio & Sign In
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-stone-100 text-center">
            <p className="text-xs text-stone-600">
              Already activated your studio?{' '}
              <Link
                to="/login"
                className="font-semibold text-stone-900 hover:text-[#9C7D4F] underline underline-offset-4"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
