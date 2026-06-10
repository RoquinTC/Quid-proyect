"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X, Image as ImageIcon, Loader2, FileText, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import Image from "next/image";

interface ReceiptUploadProps {
  /** Current receipt URL (for editing) */
  value?: string | null;
  /** Called when receipt is uploaded/removed */
  onChange: (url: string | null) => void;
  /** Compact mode for inline use in transaction list */
  compact?: boolean;
  /** Allow PDFs in addition to images. */
  allowPdf?: boolean;
  /** User-facing label for the upload action. */
  uploadLabel?: string;
}

const MAX_SUPPORT_MB = 25;

function isPdfUrl(url: string | null) {
  return Boolean(url && /\.pdf(?:$|\?)/i.test(url));
}

export function ReceiptUpload({ value, onChange, compact, allowPdf = true, uploadLabel }: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [showFullImage, setShowFullImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFileSelect = async (file: File) => {
    const isSupportedPdf = allowPdf && file.type === "application/pdf";
    if (!file.type.startsWith("image/") && !isSupportedPdf) {
      alert(allowPdf ? "Selecciona una imagen o un PDF" : "Selecciona una imagen");
      return;
    }
    if (file.size > MAX_SUPPORT_MB * 1024 * 1024) {
      alert(`El archivo excede el límite de ${MAX_SUPPORT_MB}MB`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await apiFetch<{ url: string }>("/api/upload", {
        method: "POST",
        body: formData as unknown as undefined, // Let fetch handle FormData
      });

      setPreview(result.url);
      onChange(result.url);
    } catch (error) {
      console.error("Error uploading receipt:", error);
      alert("Error al subir el recibo");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) await handleFileSelect(file);
  };

  const handleRemove = async () => {
    if (preview) {
      try {
        await apiFetch(`/api/upload?url=${encodeURIComponent(preview)}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore deletion errors
      }
    }
    setPreview(null);
    onChange(null);
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  if (compact && preview) {
    if (isPdfUrl(preview)) {
      return (
        <a
          href={preview}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300"
          title="Abrir PDF"
        >
          <FileText className="size-4" />
        </a>
      );
    }

    return (
      <>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowFullImage(true)}
          className="relative size-10 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shrink-0"
        >
          <Image
            src={preview}
            alt="Recibo"
            fill
            className="object-cover"
            sizes="40px"
          />
        </motion.button>

        <AnimatePresence>
          {showFullImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setShowFullImage(false)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="relative max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={preview}
                  alt="Recibo"
                  width={800}
                  height={1200}
                  className="max-h-[80vh] w-auto object-contain rounded-lg"
                />
                <button
                  onClick={() => setShowFullImage(false)}
                  className="absolute -top-2 -right-2 size-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (compact) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept={allowPdf ? "image/*,application/pdf,.pdf" : "image/*"}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
            e.target.removeAttribute("capture");
          }}
        />
        <button
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.removeAttribute("capture");
              fileInputRef.current.click();
            }
          }}
          className="size-10 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-purple-500 hover:border-purple-400 transition-colors"
          title="Adjuntar recibo"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
        </button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={allowPdf ? "image/*,application/pdf,.pdf" : "image/*"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
          e.target.removeAttribute("capture");
        }}
      />

      {preview ? (
        <div className="relative group">
          {isPdfUrl(preview) ? (
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-24 items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3 text-left transition hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/20 dark:hover:bg-purple-950/35"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-purple-600 shadow-sm dark:bg-gray-950 dark:text-purple-300">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900 dark:text-white">PDF adjunto</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-300">
                  Abrir documento <ExternalLink className="size-3" />
                </span>
              </span>
            </a>
          ) : (
            <div
              className="relative h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer"
              onClick={() => setShowFullImage(true)}
            >
              <Image
                src={preview}
                alt="Recibo adjunto"
                fill
                className="object-cover"
                sizes="300px"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ImageIcon className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          )}
          <button
            onClick={handleRemove}
            className="absolute -top-2 -right-2 size-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center hover:border-purple-400 dark:hover:border-purple-600 transition-colors"
        >
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Upload className="size-3.5" />
              {uploadLabel || (allowPdf ? "Subir archivo" : "Subir foto")}
            </button>
            <button
              type="button"
              onClick={handleCameraCapture}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Camera className="size-3.5" />
              Cámara
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {allowPdf ? "JPG, PNG, WEBP o PDF" : "JPG, PNG, WEBP"} · Máximo {MAX_SUPPORT_MB}MB
          </p>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
          <Loader2 className="size-3 animate-spin" />
          Subiendo recibo...
        </div>
      )}

      {/* Full image modal */}
      <AnimatePresence>
        {showFullImage && preview && !isPdfUrl(preview) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowFullImage(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={preview}
                alt="Recibo"
                width={800}
                height={1200}
                className="max-h-[80vh] w-auto object-contain rounded-lg"
              />
              <button
                onClick={() => setShowFullImage(false)}
                className="absolute -top-2 -right-2 size-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
