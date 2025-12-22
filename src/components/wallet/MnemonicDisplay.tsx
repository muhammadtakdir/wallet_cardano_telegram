"use client";

import * as React from "react";
import { Card, Button, Input } from "@/components/ui";

export interface MnemonicDisplayProps {
  mnemonic: string;
  onConfirmed?: () => void;
  showCopyButton?: boolean;
  title?: string;
  warning?: string;
  requireVerification?: boolean; // New: require word verification before continue
  verificationWordCount?: number; // New: how many words to verify (default 3)
}

export const MnemonicDisplay: React.FC<MnemonicDisplayProps> = ({
  mnemonic,
  onConfirmed,
  showCopyButton = false,
  title = "Your Recovery Phrase",
  warning = "Write down these words in order and keep them safe. Anyone with this phrase can access your funds. NEVER share this with anyone!",
  requireVerification = true,
  verificationWordCount = 3,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [showVerification, setShowVerification] = React.useState(false);
  const [verificationInputs, setVerificationInputs] = React.useState<Record<number, string>>({});
  const [verificationError, setVerificationError] = React.useState<string | null>(null);

  const words = mnemonic.split(" ");

  // Generate random word indices for verification
  const [verificationIndices, setVerificationIndices] = React.useState<number[]>([]);
  
  React.useEffect(() => {
    // Generate random indices when component mounts
    const indices: number[] = [];
    const availableIndices = Array.from({ length: words.length }, (_, i) => i);
    
    for (let i = 0; i < verificationWordCount && availableIndices.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableIndices.length);
      indices.push(availableIndices[randomIndex]);
      availableIndices.splice(randomIndex, 1);
    }
    
    setVerificationIndices(indices.sort((a, b) => a - b));
  }, [words.length, verificationWordCount]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleProceedToVerification = () => {
    if (requireVerification) {
      setShowVerification(true);
      setVerificationError(null);
    } else {
      onConfirmed?.();
    }
  };

  const handleVerificationInputChange = (index: number, value: string) => {
    setVerificationInputs((prev) => ({
      ...prev,
      [index]: value.toLowerCase().trim(),
    }));
    setVerificationError(null);
  };

  const handleVerifyAndContinue = () => {
    // Check all verification words
    const allCorrect = verificationIndices.every(
      (wordIndex) => verificationInputs[wordIndex]?.toLowerCase().trim() === words[wordIndex].toLowerCase()
    );

    if (allCorrect) {
      setVerificationError(null);
      onConfirmed?.();
    } else {
      setVerificationError("One or more words are incorrect. Please check and try again.");
    }
  };

  const allVerificationFilled = verificationIndices.every(
    (index) => verificationInputs[index]?.length > 0
  );

  // Verification Screen
  if (showVerification) {
    return (
      <Card variant="elevated" padding="lg">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Verify Your Recovery Phrase
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter the following words from your recovery phrase to confirm you&apos;ve saved it
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {verificationIndices.map((wordIndex) => (
            <div key={wordIndex}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Word #{wordIndex + 1}
              </label>
              <input
                type="text"
                value={verificationInputs[wordIndex] || ""}
                onChange={(e) => handleVerificationInputChange(wordIndex, e.target.value)}
                placeholder={`Enter word #${wordIndex + 1}`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          ))}
        </div>

        {verificationError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              {verificationError}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="primary"
            fullWidth
            onClick={handleVerifyAndContinue}
            disabled={!allVerificationFilled}
          >
            Verify & Continue
          </Button>
          <Button
            variant="outline"
            fullWidth
            onClick={() => setShowVerification(false)}
          >
            ← Back to Recovery Phrase
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="elevated" padding="lg">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {words.length} words
        </p>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 mb-4">
        <div className="flex items-start gap-2">
          <WarningIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            {warning}
          </p>
        </div>
      </div>

      {/* Mnemonic Grid */}
      <div className="relative">
        {!revealed && (
          <div
            className="absolute inset-0 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center z-10 cursor-pointer"
            onClick={() => setRevealed(true)}
          >
            <div className="text-center">
              <EyeOffIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tap to reveal
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
          {words.map((word, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 bg-white dark:bg-gray-800 rounded-lg px-2 py-1.5 border border-gray-200 dark:border-gray-700"
            >
              <span className="text-xs text-gray-400 w-5">{index + 1}.</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {revealed ? word : "••••"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 space-y-3">
        {showCopyButton && revealed && (
          <Button
            variant="outline"
            fullWidth
            onClick={handleCopy}
            className="flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4" />
                Copy to Clipboard
              </>
            )}
          </Button>
        )}

        {onConfirmed && revealed && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I have safely stored my recovery phrase and understand that losing it means losing access to my funds.
              </span>
            </label>
            <Button
              variant="primary"
              fullWidth
              disabled={!confirmed}
              onClick={handleProceedToVerification}
            >
              {requireVerification ? "I've Written It Down →" : "Continue"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

// Icons
const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const EyeOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

MnemonicDisplay.displayName = "MnemonicDisplay";
