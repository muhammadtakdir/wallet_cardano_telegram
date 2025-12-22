"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { type CardanoNetwork } from "@/lib/cardano";

export interface NetworkSelectorProps {
  currentNetwork: CardanoNetwork;
  onNetworkChange: (network: CardanoNetwork) => void;
  onClose: () => void;
  isOpen: boolean;
}

interface NetworkOption {
  id: CardanoNetwork;
  name: string;
  description: string;
  color: string;
  bgColor: string;
  isTestnet: boolean;
}

const networks: NetworkOption[] = [
  {
    id: "mainnet",
    name: "Mainnet",
    description: "Production network with real ADA",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    isTestnet: false,
  },
  {
    id: "preprod",
    name: "Pre-Production",
    description: "Testing network that mirrors mainnet",
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    isTestnet: true,
  },
  {
    id: "preview",
    name: "Preview",
    description: "Cutting-edge features testing network",
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    isTestnet: true,
  },
];

export const NetworkSelector: React.FC<NetworkSelectorProps> = ({
  currentNetwork,
  onNetworkChange,
  onClose,
  isOpen,
}) => {
  const [selectedNetwork, setSelectedNetwork] = React.useState<CardanoNetwork>(currentNetwork);
  const [showConfirm, setShowConfirm] = React.useState(false);

  React.useEffect(() => {
    setSelectedNetwork(currentNetwork);
  }, [currentNetwork]);

  const handleSelect = (network: CardanoNetwork) => {
    setSelectedNetwork(network);
    if (network !== currentNetwork) {
      setShowConfirm(true);
    }
  };

  const handleConfirm = () => {
    onNetworkChange(selectedNetwork);
    setShowConfirm(false);
    onClose();
  };

  const handleCancel = () => {
    setSelectedNetwork(currentNetwork);
    setShowConfirm(false);
  };

  if (!isOpen) return null;

  const selectedNetworkInfo = networks.find((n) => n.id === selectedNetwork);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card padding="lg" className="w-full max-w-md">
        {!showConfirm ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Select Network
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <CloseIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Network Options */}
            <div className="space-y-3">
              {networks.map((network) => (
                <button
                  key={network.id}
                  onClick={() => handleSelect(network.id)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedNetwork === network.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${network.bgColor} flex items-center justify-center flex-shrink-0`}
                    >
                      <NetworkIcon className={`w-5 h-5 ${network.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {network.name}
                        </span>
                        {network.isTestnet && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
                            Testnet
                          </span>
                        )}
                        {currentNetwork === network.id && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {network.description}
                      </p>
                    </div>
                    {selectedNetwork === network.id && (
                      <CheckCircleIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Info */}
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex gap-2">
                <WarningIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Changing network will require re-entering your PIN. Your wallet addresses may differ on each network.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation Dialog */}
            <div className="text-center">
              <div
                className={`w-16 h-16 mx-auto rounded-full ${selectedNetworkInfo?.bgColor} flex items-center justify-center mb-4`}
              >
                <NetworkIcon className={`w-8 h-8 ${selectedNetworkInfo?.color}`} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Switch to {selectedNetworkInfo?.name}?
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                You will be logged out and need to unlock your wallet again. Make sure you have your PIN ready.
              </p>

              {selectedNetworkInfo?.id === "mainnet" && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div className="flex gap-2">
                    <WarningIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 text-left">
                      <strong>Warning:</strong> Mainnet uses real ADA. Make sure you understand the risks before proceeding.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" fullWidth onClick={handleCancel}>
                  Cancel
                </Button>
                <Button variant="primary" fullWidth onClick={handleConfirm}>
                  Switch Network
                </Button>
              </div>
            </div>
          </>
        )}
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

const NetworkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
    />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

NetworkSelector.displayName = "NetworkSelector";
