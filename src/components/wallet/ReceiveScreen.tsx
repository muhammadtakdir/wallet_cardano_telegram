"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { shortenAddress } from "@/lib/cardano";
import QRCode from "qrcode";

export interface ReceiveScreenProps {
  onBack: () => void;
}

export const ReceiveScreen: React.FC<ReceiveScreenProps> = ({ onBack }) => {
  const { walletAddress, network } = useWalletStore();
  const [copied, setCopied] = React.useState(false);
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string>("");

  // Generate QR code
  React.useEffect(() => {
    if (walletAddress) {
      QRCode.toDataURL(walletAddress, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error("QR generation error:", err));
    }
  }, [walletAddress]);

  const handleCopy = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (walletAddress && navigator.share) {
      try {
        await navigator.share({
          title: "My Cardano Address",
          text: walletAddress,
        });
      } catch (err) {
        // User cancelled or share not supported
        console.log("Share cancelled or not supported");
      }
    } else {
      // Fallback to copy
      handleCopy();
    }
  };

  const networkLabel = {
    mainnet: { text: "Mainnet", color: "bg-green-500" },
    preprod: { text: "Preprod Testnet", color: "bg-yellow-500" },
    preview: { text: "Preview Testnet", color: "bg-purple-500" },
  }[network] || { text: network, color: "bg-gray-500" };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
        >
          <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Receive ADA
        </h1>
      </header>

      <Card padding="lg" className="space-y-6">
        {/* Network Badge */}
        <div className="flex justify-center">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white ${networkLabel.color}`}>
            {networkLabel.text}
          </span>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-2xl shadow-sm">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="Wallet QR Code"
                className="w-48 h-48"
              />
            ) : (
              <div className="w-48 h-48 bg-gray-100 animate-pulse rounded-lg" />
            )}
          </div>
        </div>

        {/* Address Display */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2 text-center">Your Wallet Address</p>
          <p className="text-sm font-mono text-gray-900 dark:text-white break-all text-center leading-relaxed">
            {walletAddress}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            fullWidth
            onClick={handleCopy}
            className="flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleShare}
            className="flex items-center justify-center gap-2"
          >
            <ShareIcon className="w-4 h-4" />
            Share
          </Button>
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <InfoIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Receive ADA & Native Assets</p>
              <p className="text-xs opacity-80">
                Share this address to receive ADA, tokens, and NFTs on the Cardano {networkLabel.text.toLowerCase()}.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Icons
const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

ReceiveScreen.displayName = "ReceiveScreen";
