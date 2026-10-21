import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { WeddingEvent } from '../../types/index.js';

const eventFormSchema = z.object({
  title: z.string().trim().min(2, 'Wedding title must be at least 2 characters').max(200),
  brideName: z.string().trim().max(100).optional().or(z.literal('')),
  groomName: z.string().trim().max(100).optional().or(z.literal('')),
  eventDate: z.string().min(1, 'Please select the wedding date'),
  venue: z.string().trim().max(200).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  coverImageUrl: z.string().trim().url('Invalid URL').optional().or(z.literal('')),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
});

export type EventFormData = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  initialData?: Partial<WeddingEvent>;
  onSubmit: (data: EventFormData) => Promise<void>;
  isLoading?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}

export function EventForm({
  initialData,
  onSubmit,
  isLoading = false,
  onCancel,
  submitLabel = 'Save Wedding Event',
}: EventFormProps) {
  // Format initial date to YYYY-MM-DD for date input
  const defaultDate = initialData?.eventDate
    ? new Date(initialData.eventDate).toISOString().split('T')[0]
    : '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: initialData?.title || '',
      brideName: initialData?.brideName || '',
      groomName: initialData?.groomName || '',
      eventDate: defaultDate,
      venue: initialData?.venue || '',
      description: initialData?.description || '',
      coverImageUrl: initialData?.coverImageUrl || '',
      status: initialData?.status || 'UPCOMING',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Wedding Event Title"
        placeholder="e.g. Sophia & Lucas Wedding Celebration"
        required
        error={errors.title?.message}
        {...register('title')}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Bride Name"
          placeholder="e.g. Sophia Miller"
          error={errors.brideName?.message}
          {...register('brideName')}
        />
        <Input
          label="Groom Name"
          placeholder="e.g. Lucas Anderson"
          error={errors.groomName?.message}
          {...register('groomName')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Wedding Date"
          type="date"
          required
          error={errors.eventDate?.message}
          {...register('eventDate')}
        />
        <Input
          label="Venue / Location"
          placeholder="e.g. The Rosewood Estate, Napa Valley"
          error={errors.venue?.message}
          {...register('venue')}
        />
      </div>

      {initialData && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-700">
            Event Status
          </label>
          <select
            {...register('status')}
            className="w-full bg-white text-stone-900 border border-stone-300 rounded-lg px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            <option value="UPCOMING">Upcoming</option>
            <option value="ACTIVE">Active (In Progress)</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-stone-700">
          Wedding Description & Schedule
        </label>
        <textarea
          rows={3}
          placeholder="Add schedule, notes for guests, ceremony start times, or reception details..."
          className="w-full bg-white text-stone-900 border border-stone-300 rounded-lg p-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-400 placeholder:text-stone-400 resize-none"
          {...register('description')}
        />
        {errors.description?.message && (
          <p className="text-xs text-rose-600 font-medium">{errors.description.message}</p>
        )}
      </div>

      <Input
        label="Optional Cover Image URL"
        placeholder="https://images.unsplash.com/..."
        helperText="Provide a high-resolution hero photo for the public guest landing page"
        error={errors.coverImageUrl?.message}
        {...register('coverImageUrl')}
      />

      <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" isLoading={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
