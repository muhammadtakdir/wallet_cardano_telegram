"use client";

import * as React from "react";
import { useWalletStore, useTelegram } from "@/hooks";
import { hasStoredWallet, getWalletsList } from "@/lib/storage";
import { isLockedOut, getLockoutRemaining } from "@/lib/storage/encryption";
import { WalletDashboard, MnemonicDisplay, MnemonicInput, SendScreen, ReceiveScreen, AssetDetail } from "@/components/wallet";
import dynamic from "next/dynamic";
import { Card, Button, PinInput, Input } from "@/components/ui";
import { WalletAsset } from "@/lib/cardano";

// Dynamically import StakingScreen to avoid SSR WASM issues
const StakingScreen = dynamic(
  () => import("@/components/wallet/StakingScreen").then((mod) => mod.StakingScreen),
  { ssr: false }
);

// Dynamically import GovernanceScreen
const GovernanceScreen = dynamic(
  () => import("@/components/wallet/GovernanceScreen").then((mod) => mod.GovernanceScreen),
  { ssr: false }
);

// Dynamically import SwapScreen
const SwapScreen = dynamic(
  () => import("@/components/wallet/SwapScreen").then((mod) => mod.SwapScreen),
  { ssr: false }
);

type AppView = "loading" | "setup" | "create" | "import" | "import-pin" | "backup" | "unlock" | "dashboard" | "send" | "receive" | "asset-detail" | "staking" | "governance" | "swap";

// Hydration safe hook - prevents SSR mismatch
function useHydrated() {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

export default function WalletPage() {
  const hydrated = useHydrated();
  
  const {
    isLoggedIn,
    isLoading,
    error,
    createNewWallet,
    importWallet,
    unlockWallet,
    clearError,
    deleteAllWallets,
  } = useWalletStore();

  const { isInTelegram, ready, expand, hapticFeedback, user, initData } = useTelegram();

  React.useEffect(() => {
    if (user) {
      console.log('[Page] Telegram User:', user);
    }
  }, [user]);

  const [view, setView] = React.useState<AppView>("loading");
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [mnemonic, setMnemonic] = React.useState("");
  const [importMnemonic, setImportMnemonic] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [walletName, setWalletName] = React.useState("");
  const [isAddingWallet, setIsAddingWallet] = React.useState(false);
  const [selectedAsset, setSelectedAsset] = React.useState<WalletAsset | null>(null);
  const [userPoints, setUserPoints] = React.useState<number | null>(null);
  const [isDbChecked, setIsDbChecked] = React.useState(false);

  // Initial DB check (check if user exists in Supabase)
  React.useEffect(() => {
    const checkUserStatus = async () => {
      if (user && initData && !isDbChecked) {
        try {
          const response = await fetch("/api/user/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.registered) {
              setUserPoints(data.points);
            }
          } else {
             const err = await response.json();
             console.warn("Pre-check failed:", err);
          }
        } catch (e) {
          console.warn("Pre-check failed", e);
        } finally {
          setIsDbChecked(true);
        }
      }
    };
    checkUserStatus();
  }, [user, initData, isDbChecked]);

  // Full registration when wallet becomes available
  const { walletAddress, isLoggedIn: walletIsLoggedIn } = useWalletStore();
  React.useEffect(() => {
    const performFullRegistration = async () => {
      if (walletIsLoggedIn && walletAddress && user && initData) {
        try {
          const response = await fetch("/api/user/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, walletAddress }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setUserPoints(data.points);
            }
          } else {
            const errData = await response.json();
            console.error("Registration failed:", errData);
            if (isInTelegram) {
              // Show specific error to help debugging
              const msg = errData.error || "Registration failed";
              if (msg.includes("Telegram data hash")) {
                alert("Setup Error: TELEGRAM_BOT_TOKEN is missing or invalid on server.");
              } else if (msg.includes("Database")) {
                alert("Setup Error: Supabase credentials missing on server.");
              } else {
                // Only show generic errors in dev, or subtle one in prod
                console.warn("Reg error:", msg);
              }
            }
          }
        } catch (e) {
          console.error("Auto-registration failed", e);
        }
      }
    };
    performFullRegistration();
  }, [walletIsLoggedIn, walletAddress, user, initData]);

  // Initialize Telegram WebApp
  React.useEffect(() => {
    if (isInTelegram) {
      ready();
      expand();
    }
  }, [isInTelegram, ready, expand]);

  // Determine initial view on mount
  React.useEffect(() => {
    const checkWalletStatus = () => {
      if (isLoggedIn) {
        setView("dashboard");
      } else if (hasStoredWallet()) {
        setView("unlock");
      } else {
        setView("setup");
      }
    };
    
    // Small delay to allow hydration
    const timer = setTimeout(checkWalletStatus, 100);
    return () => clearTimeout(timer);
  }, [isLoggedIn]);

  // Update view when login status changes (only for initial login)
  React.useEffect(() => {
    if (isLoggedIn && (view === "loading" || view === "unlock")) {
      setView("dashboard");
    }
  }, [isLoggedIn, view]);

  // Clear errors when changing views
  React.useEffect(() => {
    clearError();
    setPinError("");
    setPin("");
    setConfirmPin("");
    setWalletName("");
  }, [view, clearError]);

  // Handle adding a new wallet from dashboard
  const handleAddWallet = () => {
    setIsAddingWallet(true);
    setView("setup");
  };

  // Handle back navigation
  const handleBack = () => {
    if (isAddingWallet && hasStoredWallet()) {
      setIsAddingWallet(false);
      setView("dashboard");
    } else {
      setView("setup");
    }
  };

  // Handle create wallet
  const handleCreateWallet = async () => {
    if (pin.length < 6) {
      setPinError("PIN must be at least 6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }

    try {
      const name = walletName.trim() || undefined;
      const newMnemonic = await createNewWallet(pin, name);
      setMnemonic(newMnemonic);
      setView("backup");
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("success");
      }
    } catch (err) {
      // Ensure error is a string for display
      const errorMsg = err instanceof Error ? err.message : String(err);
      setPinError(errorMsg);
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("error");
      }
    }
  };

  // Handle import wallet
  const handleImportWallet = async () => {
    if (pin.length < 6) {
      setPinError("PIN must be at least 6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    if (!importMnemonic.trim()) {
      setPinError("Please enter your recovery phrase");
      return;
    }

    const name = walletName.trim() || undefined;
    const success = await importWallet(importMnemonic, pin, name);
    if (success) {
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("success");
      }
      setIsAddingWallet(false);
      setImportMnemonic(""); // Clear mnemonic from state
      setView("dashboard");
    } else {
      // Error is already set by the store
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("error");
      }
    }
  };

  // Handle unlock
  const handleUnlock = async (enteredPin: string) => {
    const success = await unlockWallet(enteredPin);
    if (success) {
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("success");
      }
      setView("dashboard");
    } else {
      setPinError("Invalid PIN");
      setPin("");
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("error");
      }
    }
  };

  // Render loading - also for hydration
  if (view === "loading" || !hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading wallet...</p>
        </div>
      </div>
    );
  }

  // Render setup choice
  if (view === "setup") {
    const walletCount = getWalletsList().length;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        {/* Back button when adding wallet */}
        {isAddingWallet && (
          <button
            onClick={handleBack}
            className="absolute top-6 left-6 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <BackIcon className="w-5 h-5" />
            Back
          </button>
        )}
        
        <div className="text-center mb-8">
          <WalletLogo className="w-20 h-20 mx-auto mb-4 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {isAddingWallet ? "Add New Wallet" : "Cardano Wallet"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {isAddingWallet 
              ? `You have ${walletCount} wallet${walletCount !== 1 ? 's' : ''}`
              : "Non-custodial wallet for Telegram"
            }
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => setView("create")}
          >
            Create New Wallet
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => setView("import")}
          >
            Import Existing Wallet
          </Button>
        </div>

        <p className="mt-8 text-xs text-gray-400 dark:text-gray-500 text-center max-w-sm">
          Your keys, your crypto. All signing happens locally on your device.
          We never have access to your funds.
        </p>
      </div>
    );
  }

  // Render create wallet flow
  if (view === "create") {
    return (
      <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={handleBack}
          className="mb-6 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <BackIcon className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Create New Wallet
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Set a PIN to secure your wallet
        </p>

        <Card padding="lg" className="space-y-6">
          <Input
            label="Wallet Name (optional)"
            placeholder="e.g., Main Wallet, Trading, Savings"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            helperText="Give your wallet a name for easy identification"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Enter PIN (6+ digits)
            </label>
            <PinInput
              value={pin}
              onChange={setPin}
              error={pinError && pin.length > 0 ? pinError : undefined}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Confirm PIN
            </label>
            <PinInput
              value={confirmPin}
              onChange={setConfirmPin}
              error={pinError && confirmPin.length > 0 ? pinError : undefined}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{String(error)}</p>
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleCreateWallet}
            isLoading={isLoading}
            disabled={pin.length < 6 || confirmPin.length < 6}
          >
            Create Wallet
          </Button>
        </Card>
      </div>
    );
  }

  // Render import wallet flow - Step 1: Enter mnemonic
  if (view === "import") {
    return (
      <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={handleBack}
          className="mb-6 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <BackIcon className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Import Wallet
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Enter your recovery phrase word by word
        </p>

        <MnemonicInput
          onSubmit={(mnemonic) => {
            setImportMnemonic(mnemonic);
            setView("import-pin");
          }}
          error={error || undefined}
        />
      </div>
    );
  }

  // Render import wallet flow - Step 2: Set PIN
  if (view === "import-pin") {
    return (
      <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={() => setView("import")}
          className="mb-6 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
        >
          <BackIcon className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Secure Your Wallet
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Set a PIN to protect your wallet
        </p>

        <Card padding="lg" className="space-y-6">
          <Input
            label="Wallet Name (optional)"
            placeholder="e.g., Main Wallet, Trading, Savings"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            helperText="Give your wallet a name for easy identification"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Set PIN (6+ digits)
            </label>
            <PinInput
              value={pin}
              onChange={setPin}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Confirm PIN
            </label>
            <PinInput
              value={confirmPin}
              onChange={setConfirmPin}
            />
          </div>

          {(error || pinError) && (
            <p className="text-sm text-red-500 text-center">{String(error || pinError)}</p>
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleImportWallet}
            isLoading={isLoading}
            disabled={pin.length < 6 || confirmPin.length < 6}
          >
            Import Wallet
          </Button>
        </Card>
      </div>
    );
  }

  // Render backup screen (after wallet creation)
  if (view === "backup") {
    return (
      <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Backup Your Wallet
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Save your recovery phrase securely
        </p>

        <MnemonicDisplay
          mnemonic={mnemonic}
          onConfirmed={() => {
            setMnemonic(""); // Clear mnemonic from state
            setIsAddingWallet(false);
            setView("dashboard");
          }}
        />
      </div>
    );
  }

  // Render unlock screen
  if (view === "unlock") {
    const locked = isLockedOut();
    const lockoutSeconds = getLockoutRemaining();
    
    // Fallback initials
    const initials = user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : '?';
    console.log('[Page] Profile Photo URL:', user?.photo_url);
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="relative mb-6">
          {user?.photo_url ? (
            <img 
              src={user.photo_url} 
              alt={user.first_name} 
              className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 shadow-xl object-cover block"
              onError={(e) => {
                console.warn("Profile photo failed to load, showing fallback");
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  const fallback = parent.querySelector('.photo-fallback');
                  if (fallback) (fallback as HTMLElement).style.setProperty('display', 'flex', 'important');
                }
              }}
            />
          ) : null}
          
          {/* Initials Fallback (Shown if no photo_url OR if img fails) */}
          <div 
            className="photo-fallback w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-white dark:border-gray-800 shadow-xl"
            style={{ display: user?.photo_url ? 'none' : 'flex' }}
          >
            {initials}
          </div>

          <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-2 border-2 border-white dark:border-gray-800 shadow-md">
            <WalletLogo className="w-5 h-5 text-white" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          {user ? `Welcome back, ${user.first_name}` : "Welcome Back"}
        </h1>
        {userPoints !== null && (
          <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-bold mb-4">
            {userPoints} PTS
          </div>
        )}
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-center">
          Enter your PIN to unlock
        </p>

        <Card padding="lg" className="w-full max-w-sm">
          {locked ? (
            <div className="text-center py-4">
              <div className="text-red-500 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-red-500 font-medium">Too many failed attempts</p>
              <p className="text-gray-500 text-sm mt-1">
                Try again in {Math.ceil(lockoutSeconds / 60)} minute{lockoutSeconds > 60 ? 's' : ''}
              </p>
            </div>
          ) : (
            <>
              <PinInput
                value={pin}
                onChange={setPin}
                onComplete={handleUnlock}
                error={pinError}
                autoFocus
              />

              {isLoading && (
                <div className="mt-4 text-center text-gray-500">
                  Unlocking...
                </div>
              )}
            </>
          )}
        </Card>

        <button
          onClick={() => {
            // Show reset option
            if (confirm("This will delete ALL your wallets. Make sure you have your recovery phrases backed up. Continue?")) {
              deleteAllWallets();
              setView("setup");
            }
          }}
          className="mt-8 text-sm text-red-500 hover:text-red-600"
        >
          Forgot PIN? Reset All Wallets
        </button>
      </div>
    );
  }

  // Render send screen
  if (view === "send") {
    return (
      <SendScreen
        onBack={() => setView("dashboard")}
        onSuccess={(txHash) => {
          console.log("Transaction sent:", txHash);
          // Refresh balance after successful send
          useWalletStore.getState().refreshBalance();
        }}
      />
    );
  }

  // Render receive screen
  if (view === "receive") {
    return <ReceiveScreen onBack={() => setView("dashboard")} />;
  }

  // Render asset detail screen
  if (view === "asset-detail" && selectedAsset) {
    return (
      <AssetDetail
        asset={selectedAsset}
        onBack={() => {
          setSelectedAsset(null);
          setView("dashboard");
        }}
        onSend={() => {
          // TODO: Pre-select this asset in SendScreen
          setView("send");
        }}
      />
    );
  }

  // Render dashboard
  if (view === "dashboard") {
    return (
      <WalletDashboard
        onAddWallet={handleAddWallet}
        onSend={() => {
          console.log("page.tsx: onSend called, setting view to send");
          setView("send");
        }}
        onReceive={() => {
          console.log("page.tsx: onReceive called, setting view to receive");
          setView("receive");
        }}
        onStaking={() => {
          console.log("page.tsx: onStaking called, setting view to staking");
          setView("staking");
        }}
        onGovernance={() => {
          setView("governance");
        }}
        onSwap={() => {
          setView("swap");
        }}
        onAssetClick={(asset) => {
          console.log("page.tsx: onAssetClick called", asset);
          setSelectedAsset(asset);
          setView("asset-detail");
        }}
        points={userPoints}
      />
    );
  }

  // Render staking
  if (view === "staking") {
    return (
      <StakingScreen
        onBack={() => setView("dashboard")}
      />
    );
  }

  // Render governance
  if (view === "governance") {
    return (
      <GovernanceScreen
        onBack={() => setView("dashboard")}
      />
    );
  }

  // Render swap
  if (view === "swap") {
    return (
      <SwapScreen
        onBack={() => setView("dashboard")}
      />
    );
  }

  return null;
}

// Icons
const WalletLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
  </svg>
);

const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
