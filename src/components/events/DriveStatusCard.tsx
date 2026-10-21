import { useState, useEffect, useCallback } from 'react';
import { HardDrive, AlertTriangle, ExternalLink, RefreshCw, KeyRound, CheckCircle2, Unlink } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { eventService } from '../../services/event.service.js';
import { DriveStatusResponse, WeddingEvent } from '../../types/index.js';
import { useToast } from '../../hooks/useToast.js';
import { formatDate } from '../../lib/utils.js';

interface DriveStatusCardProps {
  event: WeddingEvent;
  onEventUpdated?: () => void;
}

export function DriveStatusCard({ event }: DriveStatusCardProps) {
  const [status, setStatus] = useState<DriveStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const { success, error, info } = useToast();

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
      setShowSetupModal(true);
      return;
    }

    try {
      setConnecting(true);
      const res = await eventService.initiateDriveConnect();
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        // Direct route
        window.location.href = '/api/integrations/google-drive/connect';
      }
    } catch (err: any) {
      if (err.message?.includes('not yet configured') || err.message?.includes('GOOGLE_DRIVE_NOT_CONFIGURED')) {
        setShowSetupModal(true);
      } else {
        error('Connection Error', err.message || 'Failed to initiate Google Drive authentication.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Drive from your photographer account?')) {
      return;
    }

    try {
      setDisconnecting(true);
      await eventService.disconnectDrive();
      success('Google Drive Disconnected', 'Your Google Drive account has been unlinked.');
      await fetchDriveStatus();
    } catch (err: any) {
      error('Disconnection Failed', err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
        <div>
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
            {status?.connected ? (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-950">Linked Google Account:</span>
                  <span className="text-xs font-mono text-emerald-800 font-semibold">
                    {status.googleEmail || 'Account Connected'}
                  </span>
                </div>
                {status.connectedAt && (
                  <p className="text-[11px] text-emerald-700">
                    Connected on {formatDate(status.connectedAt)} · Refresh token securely encrypted (AES-256-GCM)
                  </p>
                )}
              </div>
            ) : status?.configured ? (
              <div className="p-3.5 bg-[#FBF9F5] border border-[#E8DEC9] rounded-xl text-xs text-stone-700 leading-relaxed">
                Connect your Google Drive to sync this wedding event folder with upcoming high-resolution photo galleries.
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-semibold block text-amber-950">OAuth Credentials Not Configured</span>
                  Add your Google Cloud OAuth keys to enable automatic Drive photo album synchronization.
                </div>
              </div>
            )}

            {/* Stage 1 Placeholders for Photo Counts and Processing */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
                  Photos In Folder
                </span>
                <span className="text-lg font-serif font-medium text-stone-800 mt-0.5 block">
                  {event.driveFolderId ? 'Pending sync' : '0 photos'}
                </span>
                <span className="text-[10px] text-stone-400">Indexed in Stage 2</span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
                  AI Face Scanner
                </span>
                <span className="text-xs font-medium text-amber-800 mt-2 block">
                  Stage 2 Ready
                </span>
                <span className="text-[10px] text-stone-400">Scheduled for Stage 2</span>
              </div>
            </div>
          </div>
        </div>

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

          <button
            onClick={() => setShowSetupModal(true)}
            className="text-xs text-stone-500 hover:text-stone-800 underline underline-offset-4 cursor-pointer"
          >
            Setup Guide
          </button>
        </div>
      </div>

      {/* Google Cloud Drive Setup Modal */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="Google Drive OAuth Integration Setup"
        description="Follow these steps to enable Google Drive photo syncing on your instance."
        maxWidth="lg"
      >
        <div className="space-y-4 text-sm text-stone-700">
          <div className="p-3 bg-[#FDFBF7] border border-[#E9DFC7] rounded-xl flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-800 leading-relaxed">
              Google Drive OAuth utilizes offline authorization code flow with AES-256-GCM encrypted refresh tokens.
              Once keys are provided in <code className="bg-stone-200/80 px-1 py-0.5 rounded font-mono">.env</code>, photographers can authenticate with one click.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">1</span>
              <div>
                <h4 className="font-semibold text-stone-900">Google Cloud Console Project</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Visit <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-stone-900 font-semibold underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-3 h-3" /></a> and create or select a project.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">2</span>
              <div>
                <h4 className="font-semibold text-stone-900">Enable Google Drive API</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Navigate to <strong>APIs & Services &gt; Library</strong>, search for <em>Google Drive API</em>, and click <strong>Enable</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">3</span>
              <div>
                <h4 className="font-semibold text-stone-900">Create OAuth 2.0 Credentials</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Go to <strong>APIs & Services &gt; Credentials &gt; Create Credentials &gt; OAuth client ID</strong>.
                  Select <em>Web application</em> and add the following <strong>Authorized redirect URI</strong>:
                </p>
                <div className="mt-1.5 p-2 bg-stone-100 border border-stone-300 rounded font-mono text-xs text-stone-800 select-all">
                  {window.location.origin}/api/integrations/google-drive/callback
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">4</span>
              <div>
                <h4 className="font-semibold text-stone-900">Configure .env</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Paste your Client ID and Client Secret into your server's <code className="bg-stone-200 px-1 rounded font-mono">.env</code>:
                </p>
                <pre className="mt-1.5 p-2.5 bg-stone-900 text-stone-100 rounded-lg font-mono text-xs overflow-x-auto">
{`GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="${window.location.origin}/api/integrations/google-drive/callback"`}
                </pre>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setShowSetupModal(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
