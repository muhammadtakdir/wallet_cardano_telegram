"use client";

import React, { useState, useEffect } from "react";
import { useWalletStore, useWalletData, useWalletActions } from "@/hooks/useWalletStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PinInput } from "@/components/ui/PinInput";
import { StoredWalletInfo } from "@/lib/storage";

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWallet: () => void;
}

/**
 * Wallet Selector Component
 * Allows users to view, switch, rename, and delete wallets
 */
export const WalletSelector: React.FC<WalletSelectorProps> = ({
  isOpen,
  onClose,
  onAddWallet,
}) => {
  const { wallets, activeWalletId, walletName } = useWalletData();
  const { switchWallet, deleteWallet, renameWallet } = useWalletActions();
  const isLoading = useWalletStore((s) => s.isLoading);
  const error = useWalletStore((s) => s.error);
  const clearError = useWalletStore((s) => s.clearError);

  // Local states
  const [showPinInput, setShowPinInput] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Load wallets on open

  // Reset states on close
  useEffect(() => {
    if (!isOpen) {
      setShowPinInput(false);
      setSelectedWalletId(null);
      setPin("");
      setEditingWalletId(null);
      setShowDeleteConfirm(null);
      clearError();
    }
  }, [isOpen, clearError]);

  if (!isOpen) return null;

  const handleSelectWallet = (walletId: string) => {
    if (walletId === activeWalletId) {
      onClose();
      return;
    }
    setSelectedWalletId(walletId);
    setShowPinInput(true);
    clearError();
  };

  const handleSwitchWallet = async () => {
    if (!selectedWalletId || pin.length < 6) return;

    const success = await switchWallet(selectedWalletId, pin);
    if (success) {
      setPin("");
      setShowPinInput(false);
      setSelectedWalletId(null);
      onClose();
    }
  };

  const handleRename = (walletId: string, currentName: string) => {
    setEditingWalletId(walletId);
    setNewName(currentName);
  };

  const handleSaveRename = (walletId: string) => {
    if (newName.trim()) {
      renameWallet(walletId, newName.trim());
    }
    setEditingWalletId(null);
    setNewName("");
  };

  const handleDelete = (walletId: string) => {
    deleteWallet(walletId);
    setShowDeleteConfirm(null);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 12)}...${address.slice(-8)}`;
  };

  // PIN Input View
  if (showPinInput) {
    const selectedWallet = wallets.find((w) => w.id === selectedWalletId);
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 bg-gray-900">
          <h2 className="text-xl font-bold text-white mb-2">Switch Wallet</h2>
          <p className="text-gray-400 text-sm mb-4">
            Enter PIN to switch to &quot;{selectedWallet?.name}&quot;
          </p>

          <PinInput
            length={6}
            value={pin}
            onChange={setPin}
            disabled={isLoading}
          />

          {error && (
            <p className="text-red-500 text-sm mt-4 text-center">{String(error)}</p>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowPinInput(false);
                setSelectedWalletId(null);
                setPin("");
                clearError();
              }}
            >
              Cancel
            </Button>
            <Button
              fullWidth
              onClick={handleSwitchWallet}
              disabled={pin.length < 6 || isLoading}
              isLoading={isLoading}
            >
              Switch
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Main Wallet List View
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <Card className="w-full sm:max-w-md max-h-[80vh] bg-gray-900 rounded-t-3xl sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">My Wallets</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wallet List */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`relative p-4 rounded-xl border ${
                wallet.id === activeWalletId
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 bg-gray-800 hover:border-gray-600"
              }`}
            >
              {/* Delete Confirmation */}
              {showDeleteConfirm === wallet.id && (
                <div className="absolute inset-0 bg-gray-900/95 rounded-xl flex items-center justify-center p-4 z-10">
                  <div className="text-center">
                    <p className="text-white text-sm mb-3">Delete this wallet?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(wallet.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Editing Name */}
              {editingWalletId === wallet.id ? (
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Wallet name"
                    className="flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleSaveRename(wallet.id)}>
                    Save
                  </Button>
                </div>
              ) : (
                <div
                  className="cursor-pointer"
                  onClick={() => handleSelectWallet(wallet.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{String(wallet.name || "Unnamed Wallet")}</span>
                      {wallet.id === activeWalletId && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="text-gray-400 hover:text-white p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(wallet.id, String(wallet.name || ""));
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {wallets.length > 1 && (
                        <button
                          className="text-gray-400 hover:text-red-500 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(wallet.id);
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs font-mono">
                    {formatAddress(String(wallet.address || ""))}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Created: {wallet.createdAt ? new Date(wallet.createdAt).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Wallet Button */}
        <div className="p-4 border-t border-gray-800">
          <Button
            variant="secondary"
            fullWidth
            onClick={onAddWallet}
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Wallet
          </Button>
        </div>
      </Card>
    </div>
  );
};
