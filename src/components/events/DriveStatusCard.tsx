import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Unlink,
  FolderCheck,
  FolderSync,
} from 'lucide-react';
import { Button } from '../ui/Button.js';
import { eventService } from '../../services/event.service.js';
import { DriveStatusResponse, WeddingEvent } from '../../types/index.js';
import { useToast } from '../../hooks/useToast.js';
import { formatDate } from '../../lib/utils.js';

interface DriveStatusCardProps {
  event: WeddingEvent;
  onEventUpdated?: () => void;
}

export function DriveStatusCard({ event, onEventUpdated }: DriveStatusCardProps) {
  const [status, setStatus] = useState<DriveStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [retryingFolder, setRetryingFolder] = useState(false);
  const { success, error: showError } = useToast();

  const fetchDriveStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await eventService.getDriveStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Failed to load drive status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDriveStatus();
  }, [fetchDriveStatus]);

  const handleConnect = async () => {
    if (!status?.configured) {
      showError(
        'Google Drive connection is temporarily unavailable. Please contact the administrator.'
      );
      return;
    }

    try {
      setConnecting(true);
      const res = await eventService.initiateDriveConnect();
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        window.location.href = '/api/integrations/google-drive/connect';
      }
    } catch (err: any) {
      if (
        err.message?.includes('not yet configured') ||
        err.message?.includes('GOOGLE_DRIVE_NOT_CONFIGURED')
      ) {
        showError(
          'Google Drive connection is temporarily unavailable. Please contact the administrator.'
        );
      } else {
        showError('Connection Error', err.message || 'Failed to initiate Google Drive authentication.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect Google Drive? Your existing folders will remain intact in Google Drive, but automatic creation will be paused.'
      )
    ) {
      return;
    }

    try {
      setDisconnecting(true);
      await eventService.disconnectDrive();
      success('Google Drive Disconnected', 'Your Google Drive connection has been unlinked.');
      await fetchDriveStatus();
      if (onEventUpdated) onEventUpdated();
    } catch (err: any) {
      showError('Disconnection Failed', err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRetryFolder = async () => {
    try {
      setRetryingFolder(true);
      await eventService.retryDriveFolderCreation(event._id);
      success('Folder Associated', 'Google Drive folder created and linked to this event.');
      if (onEventUpdated) onEventUpdated();
    } catch (err: any) {
      showError('Folder Creation Failed', err.message || 'Failed to create Google Drive folder.');
    } finally {
      setRetryingFolder(false);
    }
  };

  const isFolderCreated = Boolean(event.driveFolderId && (event.driveFolderStatus === 'CREATED' || !event.driveFolderStatus));
  const isFolderFailed = event.driveFolderStatus === 'FAILED';
  const isFolderPending = event.driveFolderStatus === 'PENDING';

  return (
    <>
      <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-stone-700" />
              <h3 className="text-sm font-semibold text-stone-900 tracking-tight">
                Google Drive Storage
              </h3>
            </div>
            {loading ? (
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking...
              </span>
            ) : status?.reconnectRequired ? (
              <span className="text-xs font-medium text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Reconnect Required
              </span>
            ) : status?.connected ? (
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
              </span>
            ) : status?.configured ? (
              <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                OAuth Ready
              </span>
            ) : (
              <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
                Setup Required
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {/* Account Status Card */}
            {status?.reconnectRequired ? (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900 leading-relaxed">
                  <span className="font-semibold block text-rose-950">Reconnection Required</span>
                  Your Google Drive token expired or was revoked in Google Account permissions. Please reconnect to resume automatic album creation.
                </div>
              </div>
            ) : status?.connected ? (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-950">Linked Google Account:</span>
                  <span className="text-xs font-mono text-emerald-800 font-semibold truncate max-w-[200px]">
                    {status.googleEmail || 'Account Connected'}
                  </span>
                </div>
                {status.connectedAt && (
                  <p className="text-[11px] text-emerald-700">
                    Connected on {formatDate(status.connectedAt)} · Stored under dedicated parent folder "Wedding AI Photo Finder"
                  </p>
                )}
              </div>
            ) : status?.configured ? (
              <div className="p-3.5 bg-[#FBF9F5] border border-[#E8DEC9] rounded-xl text-xs text-stone-700 leading-relaxed">
                Connect your Google Drive to automatically organize this wedding event inside your Drive storage.
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-semibold block text-amber-950">OAuth Credentials Not Configured</span>
                  Provide Google Cloud OAuth keys in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env</code> to enable automatic folder synchronization.
                </div>
              </div>
            )}

            {/* Event Folder Status Section */}
            {isFolderCreated ? (
              <div className="p-3.5 bg-[#F4F9F4] border border-emerald-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FolderCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-950 truncate">
                      {event.driveFolderName || event.title}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-md shrink-0">
                    Folder Created
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-stone-500 font-mono truncate max-w-[170px]">
                    ID: {event.driveFolderId?.substring(0, 14)}...
                  </span>
                  <a
                    href={
                      event.driveFolderWebViewLink ||
                      `https://drive.google.com/drive/folders/${event.driveFolderId}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-xs"
                  >
                    <span>Open Drive Folder</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : isFolderFailed ? (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" /> Folder Creation Failed
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFolder}
                    isLoading={retryingFolder}
                    className="text-xs text-rose-700 border-rose-300 hover:bg-rose-100"
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Retry Folder Creation
                  </Button>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  {event.driveFolderError || 'Could not create Google Drive folder. You can retry with the button above.'}
                </p>
              </div>
            ) : isFolderPending ? (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900">
                <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                <span>Creating album folder in Google Drive...</span>
              </div>
            ) : status?.connected ? (
              <div className="p-3.5 bg-[#FAF8F5] border border-[#E8DEC9] rounded-xl flex items-center justify-between gap-2">
                <div className="text-xs text-stone-700">
                  <span className="font-semibold block text-stone-900">Folder Pending</span>
                  Drive connected. Generate folder now:
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRetryFolder}
                  isLoading={retryingFolder}
                  leftIcon={<FolderSync className="w-3.5 h-3.5" />}
                >
                  Create Folder
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl text-xs text-stone-600 leading-relaxed">
                Connect your Google Drive to create this wedding's photo album folder automatically.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
          {status?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              isLoading={disconnecting}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
              leftIcon={<Unlink className="w-4 h-4" />}
            >
              Disconnect Drive
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConnect}
              isLoading={connecting}
              leftIcon={<HardDrive className="w-4 h-4" />}
            >
              Connect Google Drive
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

