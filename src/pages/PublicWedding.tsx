import { useState, useEffect, useRef } from 'react';
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
  QrCode,
  Image as ImageIcon,
  Image as ImageIcon2,
  X,
  Loader2,
  Maximize,
} from 'lucide-react';
import { eventService } from '../services/event.service.js';
import { PublicEvent, MatchedPhoto, IndexingStatus } from '../types/index.js';
import { formatLongDate } from '../lib/utils.js';
import { Button } from '../components/ui/Button.js';

export default function PublicWedding() {
  const { token } = useParams<{ token: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Camera state
  const [cameraState, setCameraState] = useState<'idle' | 'capturing' | 'preview'>('idle');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Indexing status
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [indexingChecked, setIndexingChecked] = useState(false);

  // Match state
  const [matching, setMatching] = useState(false);
  const [matchedPhotos, setMatchedPhotos] = useState<MatchedPhoto[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'done'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      }

      try {
        const status = await eventService.getPublicIndexingStatus(token);
        setIndexingStatus(status);
      } catch {
        // Indexing status is optional — a 404 here means the event exists
        // but hasn't been indexed yet. Don't treat it as a fatal error.
        setIndexingStatus({
          eventId: '',
          eventTitle: event?.title || '',
          status: 'IDLE',
          progress: { current: 0, total: 0 },
          error: 'Indexing status unavailable',
        });
      } finally {
        setLoading(false);
        setIndexingChecked(true);
      }
    }

    loadPublicWedding();
  }, [token]);

  useEffect(() => {
    if (!videoStream || !videoRef.current) return;

    const video = videoRef.current;
    video.srcObject = videoStream;

    const handleLoadedMetadata = () => {
      setVideoReady(!!(video.videoWidth && video.videoHeight));
      setCameraLoading(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    video.play().catch((err) => {
      console.warn('Video play failed:', err);
      setCameraError('Unable to start video playback. Please try again.');
      setCameraLoading(false);
      setVideoReady(false);
    });

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.srcObject = null;
      videoStream.getTracks().forEach((track) => track.stop());
    };
  }, [videoStream]);

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

  const startCamera = async () => {
    setCameraError(null);
    setCameraLoading(true);
    setVideoReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setVideoStream(stream);
      setCameraState('capturing');
    } catch (err: any) {
      setCameraLoading(false);
      setVideoStream(null);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access to take a selfie.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device. Please use a device with a camera.');
      } else if (err.name === 'NotSupportedError') {
        setCameraError('Camera access is not supported in this browser.');
      } else {
        setCameraError('Unable to access camera. Please try again.');
      }
    }
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }
    setVideoStream(null);
    setCameraState('idle');
    setSelfieDataUrl(null);
    setCameraError(null);
    setCameraLoading(false);
    setVideoReady(false);
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setSelfieDataUrl(dataUrl);
    stopCamera();
  };

  const retakeSelfie = () => {
    setSelfieDataUrl(null);
    setCameraError(null);
    setCameraLoading(true);
    setVideoReady(false);
    startCamera();
  };

  const startMatching = async () => {
    if (!selfieDataUrl) return;

    if (!indexingStatus || indexingStatus.status !== 'COMPLETED' || (indexingStatus.indexedCount || 0) <= 0) {
      setMatchError(
        indexingStatus?.status === 'IDLE'
          ? "The wedding photo library hasn't been indexed yet. Please ask the photographer to index the photos so you can find your images."
          : indexingStatus?.error || 'The wedding photo library is still being indexed. Please try again shortly.'
      );
      return;
    }

    setMatching(true);
    setMatchError(null);
    setMatchedPhotos([]);
    setMatchStatus('searching');

    try {
      const res = await eventService.matchSelfieToEvent(token!, selfieDataUrl);
      setMatchedPhotos(res.matches || []);
      setMatchStatus('done');
    } catch (err: any) {
      setMatchError(err.message || 'Failed to match photos. Please try again.');
      setMatchStatus('done');
    } finally {
      setMatching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-[#9C7D4F] mb-3" />
        <p className="text-xs uppercase tracking-widest text-stone-500 font-mono">
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
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-stone-500" />
          )}
          <span>{copied ? 'Link Copied!' : 'Share Page'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-5 py-6 w-full flex-1 flex flex-col items-center">
        {/* Cover image if available */}
        {event.coverImageUrl && (
          <div className="w-full h-56 sm:h-72 rounded-3xl overflow-hidden border border-[#E8DEC9] shadow-md mb-8">
            <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover" />
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

          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-stone-900 tracking-tight leading-tight">
            {event.title}
          </h1>

          {coupleNames && (
            <p className="font-serif italic text-xl sm:text-2xl text-[#685233]">
              {coupleNames}
            </p>
          )}
        </div>

        {/* Celebration details card */}
        <div className="mt-8 w-full bg-white border border-[#ECE5D8] rounded-2xl shadow-xs p-6 text-left space-y-4">
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

        {/* Google Drive Photo Matching Section */}
        <div className="mt-8 w-full">
          <div className="bg-white border border-[#ECE5D8] rounded-2xl shadow-xs p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shadow-sm">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900 tracking-tight">
                  Find Your Wedding Photos
                </h2>
                <p className="text-xs text-stone-600 mt-1">
                  Scan your face to find your photos in our wedding gallery.
                </p>
              </div>
            </div>

            {!selfieDataUrl && cameraState === 'idle' && (
              <div className="bg-[#FAF8F5] border border-[#ECE5D8] rounded-2xl p-6 text-center space-y-4">
                {indexingChecked && indexingStatus && (indexingStatus.status !== 'COMPLETED' || (indexingStatus.indexedCount || 0) <= 0) && (
                  <div className="bg-[#FDF2F2] border border-[#FECACA] rounded-xl p-4">
                    {indexingStatus.status === 'IDLE' ? (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600 mx-auto mb-2" />
                        <p className="text-xs text-rose-800 mb-2">
                          The wedding photo library hasn't been indexed yet.
                        </p>
                        <p className="text-xs text-stone-600">
                          Ask the photographer to index the wedding photos so you can find your images.
                        </p>
                      </>
                    ) : indexingStatus.status === 'INDEXING' ? (
                      <>
                        <Loader2 className="w-5 h-5 text-[#9C7D4F] animate-spin mx-auto mb-2" />
                        <p className="text-xs text-[#9C7D4F] mb-2">
                          Indexing wedding photos... {indexingStatus.progress.current}/{indexingStatus.progress.total}
                        </p>
                        <p className="text-xs text-stone-600">
                          Please check back shortly.
                        </p>
                      </>
                    ) : indexingStatus.status === 'COMPLETED' && (indexingStatus.indexedCount || 0) <= 0 ? (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600 mx-auto mb-2" />
                        <p className="text-xs text-rose-800 mb-2">
                          No faces were found in the wedding photo library.
                        </p>
                        <p className="text-xs text-stone-600">
                          Please ask the photographer to add photos with faces and re-index.
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600 mx-auto mb-2" />
                        <p className="text-xs text-rose-800 mb-2">{indexingStatus.error || 'Indexing failed'}</p>
                        <p className="text-xs text-stone-600">
                          Please ask the photographer to retry indexing.
                        </p>
                      </>
                    )}
                  </div>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={startCamera}
                  className="w-full"
                  disabled={!!(indexingChecked && indexingStatus && (indexingStatus.status !== 'COMPLETED' || (indexingStatus.indexedCount || 0) <= 0))}
                  leftIcon={<Camera className="w-4 h-4" />}
                >
                  Connect Camera
                </Button>
                <p className="mt-2 text-xs text-stone-500">
                  Scan your face to find your photos in our wedding gallery.
                  Your image is processed securely and never stored.
                </p>
              </div>
            )}

            {!selfieDataUrl && cameraState === 'capturing' && videoStream && (
              <div className="bg-[#1C1917] rounded-2xl overflow-hidden aspect-video relative shadow-lg">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                {cameraLoading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin mb-3" />
                    <p className="text-sm text-white">Starting camera...</p>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 text-center text-white">
                    <AlertCircle className="w-8 h-8 mb-3" />
                    <p className="text-sm">{cameraError}</p>
                    <button
                      onClick={stopCamera}
                      className="mt-4 text-xs underline hover:text-[#E5D7C0]"
                    >
                      Close
                    </button>
                  </div>
                )}
                {videoReady && !cameraLoading && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <Button
                      variant="primary"
                      onClick={captureSelfie}
                      className="w-full mb-4"
                      leftIcon={<Camera className="w-4 h-4" />}
                    >
                      Capture Selfie
                    </Button>
                    <button
                      onClick={stopCamera}
                      className="text-xs font-medium text-stone-400 hover:text-stone-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {selfieDataUrl && (
              <div className="bg-[#FAF8F5] border border-[#ECE5D8] rounded-2xl p-6 text-center space-y-4">
                <div className="w-48 h-48 rounded-2xl overflow-hidden border border-[#ECE5D8] bg-white mx-auto shadow-sm">
                  <img src={selfieDataUrl} alt="Your selfie" className="w-full h-full object-cover" />
                </div>

                {matching && (
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#9C7D4F] animate-spin mb-2" />
                    <p className="text-xs text-stone-600">
                      Analysing your selfie and finding your wedding photos...
                    </p>
                  </div>
                )}

                {!matching && (
                  <div className="flex items-center justify-between gap-4">
                    <Button variant="outline" size="sm" onClick={retakeSelfie} className="w-full" leftIcon={<Camera className="w-3 h-3" />}>
                      Retake
                    </Button>
                    <Button variant="primary" size="sm" onClick={startMatching} isLoading={matching} leftIcon={<Camera className="w-3 h-3" />}>
                      {matching ? 'Matching...' : 'Find My Photos'}
                    </Button>
                  </div>
                )}

                {!matching && matchStatus === 'idle' && (
                  <p className="text-xs text-stone-500">
                    Your selfie will be compared against wedding photos to find matching images.
                  </p>
                )}
              </div>
            )}

            {matchStatus === 'done' && matchedPhotos.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-xl font-semibold text-stone-900 tracking-tight">
                    Found {matchedPhotos.length} Matching Photo{matchedPhotos.length !== 1 ? 's' : ''}
                  </h3>
                  <span className="text-xs font-medium text-stone-500">Face similarity match</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedPhotos.map((photo) => (
                    <div key={photo.folderId} className="bg-white border border-[#ECE5D8] rounded-xl overflow-hidden shadow-sm">
                      <a href={photo.webViewLink || `https://drive.google.com/drive/folders/${photo.folderId}`} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="relative h-48 overflow-hidden border border-[#ECE5D8] bg-white">
                          {photo.thumbnailLink ? (
                            <img src={photo.thumbnailLink} alt={photo.fileName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 w-full bg-black/40 p-2 text-white text-xs font-semibold">
                            {photo.fileName}
                          </div>
                        </div>
                        <div className="p-3 pt-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-stone-900 truncate">{photo.fileName}</span>
                            <span className="font-bold text-emerald-600">{Math.round(photo.similarity * 100)}%</span>
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-1.5 mt-1">
                            <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${Math.round(photo.similarity * 100)}%` }} />
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Button variant="outline" size="sm" onClick={retakeSelfie} leftIcon={<Camera className="w-3 h-3" />}>
                    Scan Again
                  </Button>
                </div>
              </div>
            )}

            {matchStatus === 'done' && matchedPhotos.length === 0 && (
              <div className="mt-8 p-6 bg-[#FAF8F5] border border-[#ECE5D8] rounded-2xl text-center">
                <ImageIcon className="w-10 h-10 text-stone-300 mx-auto mb-4" />
                <h3 className="font-serif text-xl font-semibold text-stone-900">No Matching Photos Found</h3>
                <p className="text-xs text-stone-600 mt-2 max-w-sm leading-relaxed">
                  We couldn&rsquo;t find any photos matching your selfie in this wedding gallery.
                  Try again with a clearer selfie, or contact the photographer for help.
                </p>
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={retakeSelfie} leftIcon={<Camera className="w-3 h-3" />}>
                    Scan Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs text-stone-400 border-t border-[#ECE5D8] max-w-2xl mx-auto w-full">
        <p className="text-[11px]">
          Captured with care by the wedding photography team &middot; Powered by Wedding AI Photo
          Finder
        </p>
      </footer>
    </div>
  );
}
