import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HardDrive, CheckCircle2, HeartHandshake } from 'lucide-react';
import { EventForm, EventFormData } from '../components/events/EventForm.js';
import { eventService } from '../services/event.service.js';
import { DriveStatusResponse } from '../types/index.js';
import { useToast } from '../hooks/useToast.js';

export default function CreateEvent() {
  const navigate = useNavigate();
  const { success, info, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);

  useEffect(() => {
    eventService
      .getDriveStatus()
      .then((res) => setDriveStatus(res))
      .catch((err) => console.warn('Could not check Drive status:', err.message));
  }, []);

  const handleSubmit = async (data: EventFormData) => {
    try {
      setIsLoading(true);
      const newEvent = await eventService.createEvent({
        title: data.title,
        brideName: data.brideName || undefined,
        groomName: data.groomName || undefined,
        eventDate: data.eventDate,
        venue: data.venue || undefined,
        description: data.description || undefined,
        coverImageUrl: data.coverImageUrl || undefined,
      });

      if (driveStatus?.connected) {
        success('Wedding Created', 'Event registered and Google Drive album folder created automatically.');
      } else {
        info('Wedding Created', 'Event registered. Connect Google Drive anytime to create the folder automatically.');
      }

      navigate(`/events/${newEvent._id}`);
    } catch (err: any) {
      showError('Failed to Create Event', err.message || 'Please check your inputs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Weddings Dashboard</span>
        </button>
      </div>

      <div className="bg-white border border-[#ECE5D8] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 pb-6 border-b border-stone-100 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shrink-0">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-stone-900 tracking-tight">
              Register New Wedding Event
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Enter celebration details. A cryptographically secure guest URL and QR code will be generated instantly.
            </p>
          </div>
        </div>

        {/* Google Drive Status Notification */}
        {driveStatus && (
          driveStatus.connected ? (
            <div className="mb-6 p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-950 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  A Google Drive album folder will be created automatically in <strong>"Wedding AI Photo Finder"</strong>.
                </span>
              </div>
              {driveStatus.googleEmail && (
                <span className="font-mono text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  {driveStatus.googleEmail}
                </span>
              )}
            </div>
          ) : (
            <div className="mb-6 p-3.5 bg-[#FAF8F5] border border-[#E8DEC9] rounded-xl flex items-start gap-2.5 text-xs text-stone-700">
              <HardDrive className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-stone-900 block">
                  Connect Google Drive to create the folder automatically
                </span>
                Google Drive is not connected yet. You can create this wedding celebration now, and connect Google Drive anytime from your dashboard to create the folder automatically.
              </div>
            </div>
          )
        )}

        <EventForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onCancel={() => navigate('/dashboard')}
          submitLabel="Create Wedding & Generate QR Code"
        />
      </div>
    </div>
  );
}
