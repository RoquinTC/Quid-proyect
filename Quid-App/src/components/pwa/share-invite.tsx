'use client';

import { useState, useCallback } from 'react';
import { Share2, Copy, Check, QrCode, MessageCircle, Mail, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const APP_URL = 'https://quid.roquintc.app';
const APP_NAME = 'Quid';
const SHARE_TEXT = `¡Descubre Quid! La app que une tus finanzas, transporte, salud y despensa en un solo lugar. Todo converge aquí. ${APP_URL}`;

interface ShareInviteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareInvite({ open, onOpenChange }: ShareInviteProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = APP_URL;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('Enlace copiado al portapapeles');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('No se pudo copiar el enlace');
      }
      document.body.removeChild(textArea);
    }
  }, []);

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${APP_NAME} - Todo converge aquí`,
          text: SHARE_TEXT,
          url: APP_URL,
        });
      } catch (err) {
        // User cancelled or error — don't show error for cancel
        if ((err as Error).name !== 'AbortError') {
          toast.error('Error al compartir');
        }
      }
    } else {
      handleCopyLink();
    }
  }, [handleCopyLink]);

  const handleWhatsApp = useCallback(() => {
    const encoded = encodeURIComponent(SHARE_TEXT);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  }, []);

  const handleTelegram = useCallback(() => {
    const encoded = encodeURIComponent(SHARE_TEXT);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(APP_URL)}&text=${encodeURIComponent('¡Descubre Quid! La app que une tus finanzas, transporte, salud y despensa en un solo lugar.')}`, '_blank');
  }, []);

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent('Te invito a probar Quid');
    const body = encodeURIComponent(`¡Hola!\n\nQuiero invitarte a probar Quid, una app increíble que te ayuda a gestionar tus finanzas, transporte, salud y despensa todo en un solo lugar.\n\nDescúbrela en: ${APP_URL}\n\n¡Saludos!`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  }, []);

  // Check if native share is available (most mobile browsers)
  const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Share2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            Invitar a Quid
          </DialogTitle>
          <DialogDescription>
            Comparte Quid con tus amigos y familiares
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Link preview card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shrink-0">
                <img src="/icon-192.png" alt="Quid" className="size-6 rounded-lg" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  Quid - Todo converge aquí
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  quid.roquintc.app
                </p>
              </div>
            </div>
          </div>

          {/* Native share button (primary on mobile) */}
          {hasNativeShare && (
            <Button
              onClick={handleNativeShare}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-12 text-sm font-semibold gap-2"
            >
              <Share2 className="size-4" />
              Compartir enlace
            </Button>
          )}

          {/* Social options */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="size-10 rounded-xl bg-[#25D366] flex items-center justify-center shadow-sm">
                <MessageCircle className="size-5 text-white" />
              </div>
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">WhatsApp</span>
            </button>

            <button
              onClick={handleTelegram}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="size-10 rounded-xl bg-[#0088cc] flex items-center justify-center shadow-sm">
                <Send className="size-5 text-white" />
              </div>
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Telegram</span>
            </button>

            <button
              onClick={handleEmail}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="size-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm">
                <Mail className="size-5 text-white" />
              </div>
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Email</span>
            </button>
          </div>

          {/* Copy link */}
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 truncate font-mono">
              {APP_URL}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl size-10 shrink-0"
              onClick={handleCopyLink}
            >
              {copied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>

          {/* Info text */}
          <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 px-2">
            Quid es gratis. Tus amigos pueden registrarse con su email y empezar a gestionar sus finanzas, transporte y más.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
