import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, HeartHandshake } from 'lucide-react';
import { EventForm, EventFormData } from '../components/events/EventForm.js';
import { eventService } from '../services/event.service.js';
import { useToast } from '../hooks/useToast.js';

export default function CreateEvent() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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

      success('Wedding Created', 'Unique guest URL and printable QR code generated.');
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
