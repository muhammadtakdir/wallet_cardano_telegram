"use client";

import * as React from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button, Card } from "@/components/ui";

export interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  onScan,
  onClose,
  isOpen,
}) => {
  const [error, setError] = React.useState<string | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Start scanner when modal opens
  React.useEffect(() => {
    if (!isOpen) return;

    const startScanner = async () => {
      try {
        setError(null);
        setIsScanning(true);

        // Create scanner instance
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        // Get available cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (cameras && cameras.length > 0) {
          // Prefer back camera
          const backCamera = cameras.find(
            (camera) =>
              camera.label.toLowerCase().includes("back") ||
              camera.label.toLowerCase().includes("rear") ||
              camera.label.toLowerCase().includes("environment")
          );
          const cameraId = backCamera?.id || cameras[0].id;

          await scanner.start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1,
            },
            (decodedText) => {
              // Success callback
              console.log("QR Code scanned:", decodedText);
              
              // Validate if it's a Cardano address
              if (
                decodedText.startsWith("addr1") ||
                decodedText.startsWith("addr_test1")
              ) {
                handleSuccess(decodedText);
              } else if (decodedText.startsWith("web+cardano://")) {
                // Handle Cardano payment URI
                const address = extractAddressFromUri(decodedText);
                if (address) {
                  handleSuccess(address);
                } else {
                  setError("Invalid Cardano payment URI");
                }
              } else {
                setError("Not a valid Cardano address");
              }
            },
            (errorMessage) => {
              // Error callback (ignore - this fires continuously when no QR found)
            }
          );
        } else {
          setError("No cameras found on this device");
          setIsScanning(false);
        }
      } catch (err) {
        console.error("Scanner error:", err);
        const message = err instanceof Error ? err.message : String(err);
        
        if (message.includes("Permission")) {
          setError("Camera permission denied. Please allow camera access.");
        } else if (message.includes("NotFoundError")) {
          setError("No camera found on this device");
        } else {
          setError("Failed to start camera: " + message);
        }
        setIsScanning(false);
      }
    };

    startScanner();

    // Cleanup on unmount or close
    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const handleSuccess = (address: string) => {
    stopScanner();
    onScan(address);
    onClose();
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current = null;
      setIsScanning(false);
    } catch (err) {
      console.error("Error stopping scanner:", err);
    }
  };

  const extractAddressFromUri = (uri: string): string | null => {
    try {
      // web+cardano://addr1xxx or web+cardano://addr_test1xxx
      const match = uri.match(/web\+cardano:\/\/(addr[a-z0-9_]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md mx-4">
        <Card padding="lg" className="relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Scan QR Code
            </h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <CloseIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Scanner Container */}
          <div className="relative">
            <div
              id="qr-reader"
              ref={containerRef}
              className="w-full aspect-square rounded-xl overflow-hidden bg-gray-900"
            />
            
            {/* Scanning overlay */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-white/50 rounded-xl">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />
                  </div>
                </div>
                
                {/* Scanning line animation */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-blue-500/50 animate-pulse" />
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">
                {error}
              </p>
            </div>
          )}

          {/* Instructions */}
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            Point your camera at a Cardano wallet QR code
          </p>

          {/* Cancel Button */}
          <Button
            variant="outline"
            fullWidth
            className="mt-4"
            onClick={handleClose}
          >
            Cancel
          </Button>
        </Card>
      </div>
    </div>
  );
};

// Icons
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

QRScanner.displayName = "QRScanner";
