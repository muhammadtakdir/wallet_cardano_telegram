"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";

export interface MnemonicInputProps {
  wordCount?: 12 | 15 | 18 | 21 | 24;
  onSubmit: (mnemonic: string) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * MnemonicInput Component
 * Input mnemonic word by word for better UX during wallet restore
 */
export const MnemonicInput: React.FC<MnemonicInputProps> = ({
  wordCount = 24,
  onSubmit,
  isLoading = false,
  error,
}) => {
  const [words, setWords] = React.useState<string[]>(Array(wordCount).fill(""));
  const [selectedWordCount, setSelectedWordCount] = React.useState(wordCount);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Update words array when word count changes
  React.useEffect(() => {
    setWords((prev) => {
      const newWords = Array(selectedWordCount).fill("");
      // Preserve existing words
      prev.forEach((word, i) => {
        if (i < selectedWordCount) {
          newWords[i] = word;
        }
      });
      return newWords;
    });
  }, [selectedWordCount]);

  const handleWordChange = (index: number, value: string) => {
    // Clean input - only allow lowercase letters
    const cleanValue = value.toLowerCase().replace(/[^a-z]/g, "");
    
    const newWords = [...words];
    newWords[index] = cleanValue;
    setWords(newWords);

    // Auto-advance to next input if word looks complete (common BIP39 words are 3-8 chars)
    if (cleanValue.length >= 3 && value.endsWith(" ")) {
      const nextIndex = index + 1;
      if (nextIndex < selectedWordCount) {
        inputRefs.current[nextIndex]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " " || e.key === "Tab") {
      e.preventDefault();
      const nextIndex = index + 1;
      if (nextIndex < selectedWordCount) {
        inputRefs.current[nextIndex]?.focus();
      }
    } else if (e.key === "Backspace" && words[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "Enter") {
      // Submit if all words filled
      if (filledCount === selectedWordCount) {
        handleSubmit();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const pastedWords = pastedText
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (pastedWords.length > 0) {
      // Auto-detect word count from pasted mnemonic
      if ([12, 15, 18, 21, 24].includes(pastedWords.length)) {
        setSelectedWordCount(pastedWords.length as 12 | 15 | 18 | 21 | 24);
      }

      const newWords = Array(Math.max(selectedWordCount, pastedWords.length)).fill("");
      pastedWords.forEach((word, i) => {
        if (i < newWords.length) {
          newWords[i] = word;
        }
      });
      setWords(newWords.slice(0, selectedWordCount));
    }
  };

  const handleSubmit = () => {
    const mnemonic = words.join(" ").trim();
    onSubmit(mnemonic);
  };

  const handleClear = () => {
    setWords(Array(selectedWordCount).fill(""));
    inputRefs.current[0]?.focus();
  };

  const filledCount = words.filter((w) => w.length > 0).length;
  const isComplete = filledCount === selectedWordCount;

  return (
    <Card padding="lg" className="space-y-4">
      {/* Word Count Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Recovery Phrase Length
        </label>
        <div className="flex flex-wrap gap-2">
          {[12, 15, 18, 21, 24].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setSelectedWordCount(count as 12 | 15 | 18 | 21 | 24)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedWordCount === count
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {count} words
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {filledCount} of {selectedWordCount} words entered
        </span>
        {filledCount > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-red-500 hover:text-red-600 text-sm"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Word Grid */}
      <div 
        className="grid grid-cols-3 gap-2"
        onPaste={handlePaste}
      >
        {words.map((word, index) => (
          <div key={index} className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 w-5">
              {index + 1}.
            </span>
            <input
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              value={word}
              onChange={(e) => handleWordChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              placeholder="word"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`
                w-full pl-7 pr-2 py-2 text-sm rounded-lg border
                bg-white dark:bg-gray-800
                text-gray-900 dark:text-white
                placeholder-gray-400
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                ${word ? "border-green-300 dark:border-green-700" : "border-gray-200 dark:border-gray-700"}
              `}
            />
          </div>
        ))}
      </div>

      {/* Paste Hint */}
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        💡 Tip: You can paste your entire recovery phrase at once
      </p>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{String(error)}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        variant="primary"
        fullWidth
        onClick={handleSubmit}
        disabled={!isComplete || isLoading}
        isLoading={isLoading}
      >
        {isComplete ? "Verify & Import Wallet" : `Enter ${selectedWordCount - filledCount} more words`}
      </Button>
    </Card>
  );
};

MnemonicInput.displayName = "MnemonicInput";
