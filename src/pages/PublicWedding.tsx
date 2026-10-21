import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Heart,
  Camera,
  Sparkles,
  Share2,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { eventService } from '../services/event.service.js';
import { PublicEvent } from '../types/index.js';
import { formatLongDate } from '../lib/utils.js';

export default function PublicWedding() {
  const { token } = useParams<{ token: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadPublicWedding() {
      if (!token) {
        setError('Missing wedding invitation token');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await eventService.getPublicEvent(token);
        setEvent(data);
      } catch (err: any) {
        setError(err.message || 'Unable to load wedding details');
      } finally {
        setLoading(false);
      }
    }

    loadPublicWedding();
  }, [token]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event?.title || 'Wedding Celebration',
          text: `Join us in celebrating ${event?.brideName || ''} & ${event?.groomName || ''}!`,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-[#9C7D4F] mb-3" />
        <p className="text-xs uppercase tracking-widest text-stone-500 font-medium font-mono">
          Loading wedding celebration...
        </p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-stone-900">
          Wedding Event Not Found
        </h2>
        <p className="text-xs text-stone-600 mt-2 max-w-sm leading-relaxed">
          {error || 'This wedding link may have expired or is incorrect. Please check your QR code or invitation.'}
        </p>
        <Link
          to="/"
          className="mt-6 text-xs font-semibold text-stone-800 hover:text-[#9C7D4F] underline underline-offset-4"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const coupleNames = [event.brideName, event.groomName].filter(Boolean).join(' & ');

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col justify-between selection:bg-[#E5D7C0]">
      {/* Top Bar */}
      <header className="px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-serif">
          <Heart className="w-3.5 h-3.5 text-[#9C7D4F] fill-[#9C7D4F]/30" />
          <span>Wedding Celebration</span>
        </div>
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#ECE5D8] text-xs font-medium text-stone-700 hover:bg-[#F4EFE6] transition-colors shadow-2xs cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-stone-500" />}
          <span>{copied ? 'Link Copied!' : 'Share Page'}</span>
        </button>
      </header>

      {/* Hero Container */}
      <main className="max-w-xl mx-auto px-5 py-6 w-full flex-1 flex flex-col items-center text-center">
        {/* Cover image if available */}
        {event.coverImageUrl && (
          <div className="w-full h-56 sm:h-72 rounded-3xl overflow-hidden border border-[#E8DEC9] shadow-md mb-8">
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Decorative monogram / ring badge */}
        {!event.coverImageUrl && (
          <div className="w-16 h-16 rounded-full bg-white border border-[#E0D5C1] shadow-xs flex items-center justify-center text-[#9C7D4F] mb-6">
            <Heart className="w-8 h-8 fill-[#FAF5ED]" />
          </div>
        )}

        <div className="space-y-3">
          <span className="text-[11px] font-semibold tracking-widest uppercase text-[#9C7D4F] block">
            Welcome Guests
          </span>

          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 tracking-tight leading-tight">
            {event.title}
          </h1>

          {coupleNames && (
            <p className="font-serif italic text-xl sm:text-2xl text-[#685233]">
              {coupleNames}
            </p>
          )}
        </div>

        {/* Celebration details card */}
        <div className="mt-8 w-full bg-white border border-[#ECE5D8] rounded-2xl p-6 shadow-xs text-left space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F9F7F2] border border-[#ECE5D8] flex items-center justify-center text-[#9C7D4F] shrink-0 mt-0.5">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 block">
                Ceremony Date
              </span>
              <p className="text-sm font-semibold text-stone-900 mt-0.5">
                {formatLongDate(event.eventDate)}
              </p>
            </div>
          </div>

          {event.venue && (
            <div className="flex items-start gap-3 pt-3 border-t border-stone-100">
              <div className="w-8 h-8 rounded-lg bg-[#F9F7F2] border border-[#ECE5D8] flex items-center justify-center text-[#9C7D4F] shrink-0 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 block">
                  Location & Venue
                </span>
                <p className="text-sm font-semibold text-stone-900 mt-0.5">{event.venue}</p>
              </div>
            </div>
          )}

          {event.description && (
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </div>
          )}
        </div>

        {/* Stage 1 Friendly Placeholder for Photo Search */}
        <div className="mt-8 w-full bg-gradient-to-b from-[#FBF9F4] to-[#F5EFE3] border border-[#E4D9C4] rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#1C1917] text-[#E5D7C0] flex items-center justify-center mx-auto shadow-sm">
            <Camera className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#8C6D40] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Face Photo Search</span>
            </div>
            <h3 className="font-serif text-lg font-medium text-stone-900">
              Photo Galleries Coming Soon
            </h3>
          </div>

          <p className="text-xs text-stone-600 max-w-sm mx-auto leading-relaxed">
            Our wedding photographer will upload ceremony photos after the celebration.
            Once indexed in Stage 2, you will be able to take a quick selfie to instantly discover all your photos!
          </p>

          <div className="pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-white/70 border border-stone-200/80 px-3 py-1 rounded-full">
              Bookmark this link on your phone
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs text-stone-400 border-t border-[#ECE5D8] max-w-2xl mx-auto w-full">
        <p className="text-[11px]">
          Captured with care by the wedding photography team · Powered by Wedding AI Photo Finder
        </p>
      </footer>
    </div>
  );
}
