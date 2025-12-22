# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.2] - 2024-12-22 - QR Code Scanner 📷

### Added
- **QR Code Scanner for Send**: Scan recipient wallet address via camera
  - Uses `html5-qrcode` library for camera access
  - Auto-detects back camera for mobile devices
  - Validates scanned address (Cardano format check)
  - Supports both direct addresses and `web+cardano://` payment URIs
  - Visual scanning overlay with corner markers
  - Error handling for camera permissions and invalid QR codes

### Changed
- SendScreen recipient input now has "Scan QR" button
- QRScanner component added to wallet components

---

## [0.3.1] - 2024-12-22 - Security & Bug Fixes 🔒

### Fixed
- **Transaction API**: Fixed `wallet.createTx is not a function` error
  - Changed from non-existent `wallet.createTx()` to proper `MeshTxBuilder` API
  - Now correctly uses `MeshTxBuilder` with proper UTxO selection
  - Transactions properly build with change address handling

### Added
- **PIN Verification for Send**: Added PIN verification step before sending transactions
  - Users must enter their 6-digit PIN to authorize transactions
  - Prevents unauthorized transactions if device is compromised
  - Shows transaction summary (amount + recipient) during PIN entry
  - Invalid PIN error handling with retry
  - Uses existing PIN hash verification system

### Changed
- SendScreen now has additional "pin" step between confirm and sending
- Transaction flow: Input → Confirm → PIN → Sending → Success/Error

---

## [0.3.0] - 2024-12-22 - Phase 2: Send/Receive & Native Assets 🚧

### Added

#### Send ADA
- Send ADA to any Cardano address
- Address validation (Bech32 format check)
- Amount validation with balance check
- Transaction fee estimation
- Confirmation screen before sending
- Transaction status tracking

#### Receive
- QR code generation for wallet address
- Copy address to clipboard
- Share address functionality

#### Native Assets Support
- Display native tokens in wallet
- Display NFTs with metadata
- Asset detail view
- Token transfer support

---

## [0.2.2] - 2024-12-22 - Phase 1 Complete ✅

### Added

#### Mnemonic Verification
- Verify 3 random words before proceeding to wallet dashboard
- Ensures user has properly backed up their recovery phrase
- Random word selection on each wallet creation

#### MnemonicInput Component
- Per-word input grid (3 columns)
- Support for 12, 15, 18, 21, 24 word phrases
- Auto-detect word count when pasting
- Auto-advance to next input field
- Paste entire mnemonic at once
- Progress indicator (X of Y words entered)
- Clear all button

#### Import Flow Improvements
- Split into 2 steps: mnemonic input → PIN setup
- Better UX with dedicated screens

### Fixed
- Zustand infinite loop with useShallow for object selectors
- SSR hydration mismatch with hydration safety check

---

## [0.2.1] - 2024-12-22

### Security

#### Brute Force Protection
- Maximum 5 PIN attempts before 5-minute lockout
- Lockout timer displayed on unlock screen
- Failed attempts counter persisted in localStorage
- Auto-reset on successful unlock

#### Timing Attack Prevention
- Implemented timing-safe string comparison (`secureCompare`)
- Prevents attackers from guessing PIN via response time analysis

#### PIN Strength Validation
- Minimum 6 characters required
- Maximum 20 characters allowed
- Blocks common weak PINs (all same digit like "111111")
- Blocks sequential patterns (123456, 654321, etc.)

#### Mnemonic Security Improvements
- Disabled clipboard copy by default (prevent clipboard hijacking in Telegram)
- Added mnemonic format validation after decryption
- Enhanced warning message about never sharing recovery phrase
- Clear balance and transactions on wallet lock for privacy

#### Memory Security
- Clear wallet instance properly on lock
- Clear balance and transaction data when logging out
- Mnemonic never persisted in Zustand store

### Added
- `isLockedOut()` - Check if user is locked out
- `getLockoutRemaining()` - Get seconds remaining in lockout
- `validatePinStrength()` - Validate PIN meets security requirements
- `secureCompare()` - Timing-safe string comparison
- Lockout UI in unlock screen with countdown

### Changed
- `decryptWallet()` now validates mnemonic word count after decryption
- `lockWallet()` clears more sensitive data (balance, transactions)
- MnemonicDisplay `showCopyButton` default changed to `false`

---

## [0.2.0] - 2024-12-22

### Added

#### Multi-Wallet Support
- Users can now create and manage multiple wallets within the same bot
- Each wallet has its own name, address, and PIN
- Wallet selector modal to view all wallets and switch between them
- Add new wallet directly from dashboard
- Rename wallets for easy identification
- Delete individual wallets (requires at least one wallet)
- Delete all wallets option (with confirmation)

#### New Components
- `WalletSelector` - Modal component for wallet management
  - List all wallets with name, address preview, and creation date
  - Visual indicator for active wallet
  - Edit wallet name inline
  - Delete wallet with confirmation
  - PIN authentication when switching wallets
  - "Add New Wallet" button

#### Storage Updates
- `StoredWalletInfo` interface for wallet metadata
- `generateWalletId()` - Create unique wallet IDs
- `getWalletsList()` - Retrieve all stored wallets
- `addWalletToList()` / `removeWalletFromList()` - Manage wallet list
- `getActiveWalletId()` / `setActiveWalletId()` - Track active wallet
- `getWalletInfo()` - Get wallet metadata by ID
- `renameWallet()` - Update wallet name
- `deleteAllWallets()` - Clear all wallet data

#### Zustand Store Updates
- Added `wallets` array state
- Added `activeWalletId` state
- Added `walletName` state for current wallet
- Added `switchWallet(walletId, pin)` action
- Added `deleteAllWallets()` action
- Added `renameWallet(walletId, newName)` action
- Added `refreshWalletsList()` action
- Added `getWalletCount()` selector
- Modified `createNewWallet()` to accept optional name parameter
- Modified `importWallet()` to accept optional name parameter

#### UI/UX Improvements
- Wallet name displayed in dashboard header
- Clickable header to open wallet selector (shows wallet count)
- Wallet name input during create/import flows
- Back navigation support when adding wallet from dashboard
- "Delete All Wallets" option in unlock screen

### Changed
- Encryption functions now support wallet ID parameter
- Storage keys use wallet ID prefix for multi-wallet isolation
- Dashboard receives `onAddWallet` prop for add wallet flow

---

## [0.1.0] - 2024-12-22

### Added

#### Project Initialization
- Initialized Next.js 14+ project with TypeScript, Tailwind CSS, and App Router
- Configured for Vercel deployment

#### Dependencies
- `@meshsdk/core` - Cardano SDK for wallet operations
- `@meshsdk/react` - React components and hooks for MeshJS
- `zustand` - Lightweight state management
- `@twa-dev/sdk` - Telegram Web App SDK
- `crypto-js` - AES-256 encryption for mnemonic security
- `bip39` - BIP-39 mnemonic generation and validation

#### Core Features
- **Wallet Creation**: Generate new 24-word BIP-39 mnemonic phrase
- **Wallet Import**: Import existing wallet using recovery phrase
- **PIN Security**: 6-digit PIN protection with AES-256 encryption
- **Balance Display**: View ADA balance via Blockfrost API
- **Transaction History**: View recent transactions
- **Environment Detection**: Automatic Telegram WebApp vs Browser detection

#### Architecture
```
src/
├── app/                    # Next.js App Router
├── components/
│   ├── providers/          # MeshProvider wrapper
│   ├── ui/                 # Reusable UI components
│   └── wallet/             # Wallet-specific components
├── hooks/
│   ├── useTelegram.ts      # Telegram integration
│   └── useWalletStore.ts   # Zustand wallet state
└── lib/
    ├── cardano/            # MeshJS wallet operations
    └── storage/            # Encryption & localStorage
```

#### Security Implementation
- Client-side only key management (non-custodial)
- AES-256 encryption with PBKDF2 key derivation (100,000 iterations)
- PIN hash verification before decryption
- Mnemonic never stored in plain text
- No sensitive data sent to server

#### UI Components
- `Button` - Reusable button with variants and loading state
- `Card` - Card container with variants
- `Input` - Form input with label and error states
- `PinInput` - 6-digit PIN input with auto-focus
- `BalanceCard` - ADA balance display with address copy
- `MnemonicDisplay` - Recovery phrase display with reveal toggle
- `TransactionList` - Transaction history list
- `WalletDashboard` - Main wallet interface

#### Configuration
- `next.config.ts` - WASM support for MeshJS, CORS headers
- Telegram WebApp script integration
- Mobile-first responsive design
- Dark mode support

### Technical Notes

#### Mnemonic Backup
- Users **MUST** manually write down their 24-word recovery phrase
- The mnemonic is shown only once during wallet creation
- Without the recovery phrase, wallet cannot be restored if PIN is forgotten
- App includes warning and confirmation checkbox before proceeding

#### Network Configuration
- Default network: `preview` (Cardano testnet)
- Blockfrost API configured for preview network
- Change `NEXT_PUBLIC_CARDANO_NETWORK` to `mainnet` for production

### Known Limitations
- Send transaction feature not yet implemented (Phase 2)
- QR code for receiving not yet implemented
- Native asset (NFT/token) display not yet implemented

---

## Upcoming

### [0.2.0] - Planned
- Send ADA transactions
- Receive with QR code display
- Transaction confirmation flow
- Native asset support

### [0.3.0] - Planned
- Escrow smart contract integration
- Multi-signature support
- Address book
