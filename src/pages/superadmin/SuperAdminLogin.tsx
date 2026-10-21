import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Lock, Mail, ArrowRight, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { useSuperAdminAuth } from '../../hooks/useSuperAdminAuth.js';
import { useToast } from '../../hooks/useToast.js';

const superAdminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid administrative email'),
  password: z.string().min(1, 'Password is required'),
});

type SuperAdminLoginFormData = z.infer<typeof superAdminLoginSchema>;

export default function SuperAdminLogin() {
  const { login } = useSuperAdminAuth();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SuperAdminLoginFormData>({
    resolver: zodResolver(superAdminLoginSchema),
    defaultValues: {
      email: 'pentaprizmofficial@gmail.com',
    },
  });

  const onSubmit = async (data: SuperAdminLoginFormData) => {
    try {
      setIsLoading(true);
      setServerError(null);
      await login({
        email: data.email.trim().toLowerCase(),
        password: data.password.trim(),
      });
      success('Penta Prizm Authenticated', 'Welcome to the platform administration console.');
      navigate('/superadmin/dashboard');
    } catch (err: any) {
      const msg = err.message || 'Access denied. Administrative credentials invalid.';
      setServerError(msg);
      showError('Authentication Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141210] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-stone-100 selection:bg-[#C5A880] selection:text-stone-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2E2822] to-[#1C1917] border border-[#4A3F33] flex items-center justify-center text-[#E5D7C0] shadow-xl mb-4">
          <Shield className="w-7 h-7 text-[#D4B58A]" />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-[#C5A880] font-semibold block mb-1">
          Penta Prizm SaaS Platform
        </span>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#FAF8F5]">
          Super Admin Console
        </h2>
        <p className="mt-2 text-xs text-stone-400">
          Authorized personnel only · Multi-tenant studio & license management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#1C1917] py-8 px-6 sm:px-10 border border-[#332D26] rounded-2xl shadow-2xl">
          {serverError && (
            <div className="mb-6 p-3.5 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input
                label="Admin Email"
                type="email"
                autoComplete="email"
                placeholder="pentaprizmofficial@gmail.com"
                leftIcon={<Mail className="w-4 h-4 text-stone-400" />}
                error={errors.email?.message}
                className="bg-[#26211C] border-[#3E362D] text-white placeholder:text-stone-500 focus:border-[#C5A880] focus:ring-[#C5A880]/30"
                required
                {...register('email')}
              />
            </div>

            <div className="relative">
              <Input
                label="Master Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••"
                leftIcon={<Lock className="w-4 h-4 text-stone-400" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer hover:text-stone-200 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                error={errors.password?.message}
                className="bg-[#26211C] border-[#3E362D] text-white placeholder:text-stone-500 focus:border-[#C5A880] focus:ring-[#C5A880]/30"
                required
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-3 bg-[#C5A880] hover:bg-[#D4B58A] text-stone-950 font-semibold shadow-md border border-[#E5D7C0]/20"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4 text-stone-900" />}
            >
              Sign In to Super Admin
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-[#2A241E] flex flex-col gap-2 text-center text-[11px] text-stone-400 leading-relaxed">
            <div>
              Platform Master Credentials: <code className="text-[#E5D7C0] bg-[#2A241E] px-1.5 py-0.5 rounded">pentaprizmofficial@gmail.com</code> / <code className="text-[#E5D7C0] bg-[#2A241E] px-1.5 py-0.5 rounded">PentaPrizm2026!</code>
            </div>
            <div className="text-stone-500 text-[10px]">
              All administrative logins and operations are permanently logged to the immutable Penta Prizm audit ledger.
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/login"
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors underline underline-offset-4"
          >
            &larr; Switch to Photographer Studio Login
          </a>
        </div>
      </div>
    </div>
  );
}
