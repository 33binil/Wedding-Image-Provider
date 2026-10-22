import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ShieldCheck, HardDrive, RefreshCw, Sparkles, Settings2 } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { getFirebaseConfigurationMessage } from '../services/firebase.service.js';
import { isFirebaseClientConfigured } from '../config/firebase.js';

export default function Login() {
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();
  const { success, error: showError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  // Surfaced when the Firebase environment variables have not been supplied.
  const configurationMessage = getFirebaseConfigurationMessage();
  const isConfigured = isFirebaseClientConfigured();

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setServerError('');

      const result = await signInWithGoogle();

      success(
        result.firstSignIn ? 'Welcome to Penta Prizm!' : 'Welcome back!',
        result.needsDriveSetup
          ? 'Sign-in successful. Connect Google Drive from the dashboard to create wedding folders automatically.'
          : 'Your studio portal is ready.'
      );

      // Drive connection is optional — always navigate to the dashboard so the
      // photographer can choose when (or whether) to connect Google Drive.
      navigate('/dashboard');
    } catch (err: any) {
      const message =
        err?.message ||
        'We could not complete the Google sign-in. Please try again.';
      setServerError(message);
      showError('Sign-in Failed', message);
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
          Photographer Portal
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Sign in with Google to manage your wedding events and guest galleries
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 border border-[#ECE5D8] rounded-2xl shadow-sm">
          {serverError && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
              {serverError}
            </div>
          )}

          {!isConfigured && configurationMessage && (
            <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <Settings2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <span className="font-semibold block text-amber-950">Firebase setup required</span>
                {configurationMessage}
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            disabled={!isConfigured}
            title={!isConfigured ? configurationMessage ?? undefined : undefined}
            onClick={handleGoogleSignIn}
            leftIcon={
              isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.09A12 12 0 0 0 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.09Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.09C6.23 6.86 8.88 4.75 12 4.75Z"
                  />
                </svg>
              )
            }
          >
            Continue with Google
          </Button>

          <div className="mt-6 p-4 bg-[#FDFBF7] border border-[#E9DFC7] rounded-xl flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-700 leading-relaxed">
              We use <strong>Firebase Authentication</strong> with Google Sign-In. We never see or
              store your Google password, and Penta Prizm never receives your Google account
              credentials.
            </p>
          </div>

          <div className="mt-3 p-4 bg-[#F7FAF7] border border-emerald-100 rounded-xl flex items-start gap-3">
            <HardDrive className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-700 leading-relaxed">
              After signing in you will be asked to authorise <strong>Google Drive</strong> so we
              can create a photo folder for each wedding. You can skip this and connect it later.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-stone-500">
            <Sparkles className="w-3.5 h-3.5 text-[#9C7D4F]" />
            <span>Least-privilege Drive access · revocable at any time</span>
          </div>
        </div>
      </div>
    </div>
  );
}
