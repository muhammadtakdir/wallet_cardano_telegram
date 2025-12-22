"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import {
  type FiatCurrency,
  SUPPORTED_CURRENCIES,
  getCurrencyInfo,
  saveCurrency,
} from "@/lib/currency";

export interface CurrencySelectorProps {
  currentCurrency: FiatCurrency;
  onCurrencyChange: (currency: FiatCurrency) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  currentCurrency,
  onCurrencyChange,
  onClose,
  isOpen,
}) => {
  const handleSelect = (currency: FiatCurrency) => {
    saveCurrency(currency);
    onCurrencyChange(currency);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card padding="lg" className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Display Currency
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <CloseIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choose your preferred currency for displaying ADA value
        </p>

        {/* Currency Options */}
        <div className="space-y-2">
          {SUPPORTED_CURRENCIES.map((currency) => (
            <button
              key={currency.code}
              onClick={() => handleSelect(currency.code)}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                currentCurrency === currency.code
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span className="text-2xl">{currency.flag}</span>
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900 dark:text-white">
                  {currency.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currency.code.toUpperCase()} ({currency.symbol})
                </p>
              </div>
              {currentCurrency === currency.code && (
                <CheckIcon className="w-5 h-5 text-blue-500" />
              )}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          fullWidth
          className="mt-4"
          onClick={onClose}
        >
          Cancel
        </Button>
      </Card>
    </div>
  );
};

// Icons
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

CurrencySelector.displayName = "CurrencySelector";
