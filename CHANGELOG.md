# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Points & Rewards System**: Gamified experience for users.
  - **Account Age Reward**: Awards 30-400 points upon registration based on estimated Telegram account age.
  - **Transaction Rewards**:
    - **Deposit**: +500 PTS when ADA balance increases by > 5 ADA.
    - **Send**: +500 PTS for every outgoing transaction.
    - **Staking**: +1000 PTS for delegating to a pool.
    - **Undelegate**: +1000 PTS for deregistering stake key.
  - New API endpoint `/api/user/add-points` for secure point increments.
  - **Dashboard Integration**: Live point updates on the wallet dashboard and unlock screen.

- **User Registration System (Binding)**: Links Telegram identity to Cardano wallet address.
  - New API endpoint `/api/user/register` to securely handle user registration.
  - Validates Telegram `initData` hash to prevent spoofing.
  - Uses Supabase to store user data (Telegram ID, username, wallet address).
  - Updates existing users' wallet addresses if changed.
  - **Proactive Check**: Checks user status immediately upon app load to display points even before wallet unlock.

- **Supabase Integration**: Added `@supabase/supabase-js` client and `src/lib/supabaseAdmin.ts` for secure database operations.

### Security
- **API Hardening**:
  - Implemented `auth_date` validation (24-hour window) on all user APIs to prevent **Replay Attacks**.
  - Added strict **Content Security Policy (CSP)** headers to `next.config.ts` to mitigate XSS risks.
- **Data Privacy**:
  - Removed excessive `console.log` statements from production UI components (`WalletDashboard`, `TransactionList`, `BalanceCard`) to prevent data leakage.
  - Removed debug loggers that printed full wallet state.

### Fixed
- **Staking Functionality**:
  - Switched staking implementation from MeshJS to **Lucid** for better reliability and transaction building.
  - Added automatic **Stake Key Registration** logic: automatically handles the ~2 ADA deposit if the key is not yet registered on-chain.
  - Fixed "Invalid mnemonic" errors by optimizing library imports and seed generation.
- **Pool Search & Browsing**:
  - Optimized `searchPools` to support **direct Pool ID lookup** and parallel metadata fetching for speed.
  - Added **Paginated Browsing**: Users can now browse all available pools (Next/Previous buttons) when not searching.
  - Improved UI: Hides the currently delegated pool from search results to prevent confusion.
  - Added "Undelegate" button to easily deregister stake key and reclaim deposit.
- **Registration Bugs**:
  - Fixed "username column not found" error by aligning API payload with Supabase schema.
  - Fixed `initData` reference error in root page.
  - Added specific alerts for missing server configuration (`TELEGRAM_BOT_TOKEN`, `SUPABASE_KEY`).

## [0.4.0] - 2024-12-22 - Staking Feature ⚡

### Added
- **Staking Screen**: Full staking functionality for Cardano
  - View current staking status (active/inactive)
  - See delegated pool info (ticker, name, pool ID)
  - Display total staked amount and available rewards
  - Current epoch indicator

- **Reward History Chart**: Visual representation of staking rewards
  - Simple bar chart showing last 5 epochs
  - Reward amounts per epoch
  - Easy-to-read visual comparison

- **Stake Pool Search**: Find pools by ticker or name
  - Search functionality with real-time results
  - Pool details: saturation, margin, fixed cost, pledge
  - Live stake, delegator count, blocks minted

- **Default Pool**: Cardanesia [ADI]
  - One-click delegation to recommended pool
  - Automatic pool suggestion for new stakers

- **Delegation & Withdrawal**:
  - Delegate to any stake pool
  - First delegation handles stake key registration (~2 ADA deposit)
  - Change delegation between pools
  - Withdraw accumulated rewards to spendable balance

- **Pool Detail View**: Comprehensive pool information
  - Pool ID, ticker, name, description
  - Saturation percentage
  - Margin and fixed cost
  - Pledge amount
  - Live stake and delegator count
  - Blocks this epoch and total blocks
  - Link to pool website

### Changed
- `WalletDashboard.tsx` - Added "Stake" button (3-column layout)
- `page.tsx` - Added staking view routing

### New Files
- `StakingScreen.tsx` - Main staking component with:
  - Overview step (status, rewards chart)
  - Search step (find pools)
  - Pool detail step (view pool info)
  - Confirm/PIN/Processing/Success/Error flows

### Hotfix (local E2E & Mesh staking)
- `tests/e2e/staking.spec.ts` - Add Blockfrost mocks for `/accounts` and `/pools` to exercise Mesh flows
- `src/app/test/e2e-stake/page.tsx` - Convert Blockfrost UTxOs to Mesh wallet UTxO format and add debug output to help E2E reliability
- `src/lib/cardano/mesh-stake.ts` - Surface debug stack on Mesh delegation failures
- `src/lib/cardano/wallet.ts` - Propagate Mesh debug info when Mesh delegation fails and Mesh-only is enabled

### Technical
- Improved E2E robustness for Mesh staking (local-only tests)
- Added debug info to Mesh delegation responses for easier local troubleshooting

---

## [0.3.9] - 2024-12-22 - Multi-Asset Sending 📦

### Added
- **Multi-Asset Transactions**: Send ADA and native assets together in one transaction
  - Send ADA + multiple tokens/NFTs in a single transaction
  - "Add Asset" button to include additional assets
  - Remove individual assets from the send list
  - Support for fungible tokens and NFTs
  - Auto minimum ADA calculation for native assets (~1.5 ADA per asset)

- **Improved Send Screen UI**:
  - Step-based flow: Input → Add Asset → Confirm → PIN → Sending → Success
  - Visual asset type indicators (ADA, Token, NFT)
  - Asset balance display for each selected asset
  - MAX button to set maximum amount
  - NFTs automatically set to quantity 1

- **Backend Functions**:
  - `sendMultiAssetTransaction()` - Build and submit multi-asset transactions
  - `MultiAssetOutput` interface for typed asset outputs
  - MeshTxBuilder integration for complex transactions

### Changed
- `SendScreen.tsx` - Complete rewrite with multi-asset support
  - Asset selection list with "Add Asset" functionality
  - Support for ADA Handle + multi-asset together
  - Improved confirmation screen with all assets listed

- `wallet.ts` - Added multi-asset transaction builder
  - Automatic UTxO selection for multi-asset sends
  - Fee estimation for complex transactions

### Technical
- Uses MeshTxBuilder for constructing multi-output transactions
- Native asset quantity passed as string for large number support
- Minimum ADA for native assets calculated automatically

---

## [0.3.8] - 2024-12-22 - ADA Handle Support & Collateral Management 🎯

### Added
- **ADA Handle Support**: Send to ADA Handles ($handle) instead of addresses
  - Auto-detect ADA Handle format (starts with $)
  - Resolve handle to Cardano address via Blockfrost
  - Shows resolved address for verification
  - Support for mainnet, preprod, and preview networks

- **Collateral Management**: Prepare wallet for dApp interactions
  - `CollateralManager` component for collateral setup
  - Auto-detect suitable collateral UTxO (5-10 ADA, pure ADA)
  - Setup collateral with one click (creates 5 ADA UTxO)
  - Status indicator showing if wallet is dApp-ready

- **Smart Contract Preparation**: Functions for dApp support
  - `getCollateralUtxo()` - Find suitable collateral UTxO
  - `hasCollateral()` - Check if wallet can interact with smart contracts
  - `setupCollateral()` - Create collateral UTxO if needed
  - `getCollateralStatus()` - Full collateral status info

### Changed
- `SendScreen.tsx` - Updated to support ADA Handle resolution
  - New input field accepts both addresses and handles
  - Shows resolution status (loading, error, success)
  - Displays resolved handle name on confirmation screen

- `wallet.ts` - Added ADA Handle and collateral functions
  - `isAdaHandle()` - Check if input is ADA Handle format
  - `resolveAdaHandle()` - Resolve handle to address
  - `resolveRecipient()` - Smart resolve (handle or address)

### Technical
- ADA Handle policy ID configured for all networks
- Collateral minimum: 5 ADA (recommended for most dApps)
- Debounced handle resolution (500ms) for better UX

---

## [0.3.7] - 2024-12-22 - Transaction Labels & Asset Name Display 🏷️

### Added
- **Transaction IN/OUT Labels**: Clear visual indicators for transaction direction
  - Green "IN" badge for incoming transactions
  - Red "OUT" badge for outgoing transactions
  - Badges displayed next to transaction type text
  - Support for dark mode styling

- **Clickable Native Assets in Balance Card**:
  - Each asset now shows icon (Token/NFT), name, and badge
  - Click to view full asset details
  - Shows decoded readable name instead of hex
  - Token icon (blue) or NFT icon (purple) based on type

- **Asset Detail External Links**:
  - Link to CardanoScan for all networks
  - Link to Pool.pm (mainnet only)
  - Link to JPG Store for NFTs (mainnet only)

### Improved
- **Transaction Amount Display**: Now shows actual ADA amounts
  - Calculates net amount from UTxO inputs/outputs
  - Green +amount for incoming transactions
  - Red -amount for outgoing transactions
  - Displays "Received" or "Sent" based on direction

- **Native Assets Display in Balance Card**:
  - Asset names now decoded from hex to readable text
  - Shows human-readable names instead of raw hex strings
  - Uses metadata name if available
  - Fallback to truncated hex if not decodable

### Changed
- `wallet.ts` - `getTransactionHistory()` now fetches UTxO details to calculate direction and amount
- `TransactionList.tsx` - Added IN/OUT badges, displays amount with +/- prefix
- `BalanceCard.tsx` - Added `decodeAssetName()`, `onAssetClick`, asset icons and badges
- `AssetDetail.tsx` - Added external explorer links (CardanoScan, Pool.pm, JPG Store)
- `WalletDashboard.tsx` - Pass `onAssetClick` to BalanceCard
- `page.tsx` - Added asset-detail view and navigation

---

## [0.3.6] - 2024-12-22 - Improved Asset Display & Copy Functions 📋

### Fixed
- **Copy Address Fallback**: Fixed copy function for Telegram Mini App compatibility
  - Uses modern `navigator.clipboard` API when available
  - Fallback to `document.execCommand('copy')` for older browsers
  - Works in non-secure contexts (Telegram WebView)
  - Shows alert with address if all copy methods fail

### Improved
- **Receive Screen Copy**:
  - Entire address area is clickable to copy
  - Copy icon next to "Your Wallet Address" label
  - "✓ Address copied to clipboard!" feedback message
  - Hover effect on address area

- **Balance Card Address Copy**:
  - Clickable address area with hover effect
  - "✓ Copied!" inline feedback
  - Improved copy icon visibility

- **Asset List Display**:
  - Better asset name decoding from hex
  - Shows fingerprint when available (instead of just policy ID)
  - Improved icon display with fallback on image load error
  - Full-size asset icons in rounded containers

- **Asset Detail View**:
  - Shows Asset Name (Hex) field with copy button
  - Better hex-to-string decoding for asset names
  - "✓ Copied!" feedback on all copy buttons
  - Copy fallback for Telegram Mini App

### Changed
- `ReceiveScreen.tsx` - Added copy fallback and clickable address area
- `BalanceCard.tsx` - Added copy fallback and improved address section
- `AssetList.tsx` - Improved asset item display with fingerprint
- `AssetDetail.tsx` - Added Asset Name field, fixed copy function

---

## [0.3.5] - 2024-12-22 - Send Native Tokens & NFTs 🪙

### Added
- **Asset Selection Screen**: Choose which asset to send
  - List all sendable assets (ADA, tokens, NFTs)
  - ADA displayed first with ₳ symbol
  - Native tokens with green icon
  - NFTs with purple icon and "NFT" badge
  - Display balance for each asset
  - Policy ID preview for native assets

- **Send Native Tokens**: Full support for fungible tokens
  - Select any token from your wallet
  - Input custom amount to send
  - MAX button to send entire balance
  - Automatic fee + UTxO calculation (~2 ADA needed)

- **Send NFTs**: Full support for non-fungible tokens
  - NFTs auto-detected (quantity = 1)
  - Amount locked to 1 (whole unit only)
  - Clear indication "NFTs can only be sent as a whole unit"

- **Improved Send UX**:
  - "Change" button to switch selected asset
  - Selected asset info displayed at top of input form
  - Better MAX button styling
  - Detailed fee breakdown (Network Fee + Min UTxO)

### Changed
- `SendScreen.tsx` - Complete rewrite with multi-step asset selection flow
  - Step 1: Select Asset (ADA/Token/NFT)
  - Step 2: Input recipient & amount
  - Step 3: Confirm transaction details
  - Step 4: PIN verification
  - Step 5: Sending/Success/Error

- Uses `sendAssetTransaction()` from cardano lib for native assets

---

## [0.3.4] - 2024-12-22 - Balance Privacy & Currency Conversion 💱

### Added
- **Hide Balance Toggle**: Privacy feature to hide wallet balance
  - Eye icon button next to "Total Balance" label
  - Click to toggle between visible and hidden (••••••) state
  - Also hides native asset quantities when enabled
  - Preference saved to localStorage

- **Fiat Currency Display**: Show ADA value in local currency
  - Real-time ADA price from CoinGecko API
  - Price updates every 60 seconds with caching
  - Displays below ADA balance with approximate value

- **Currency Selector Modal**: Choose preferred display currency
  - 🇺🇸 USD - US Dollar
  - 🇪🇺 EUR - Euro  
  - 🇯🇵 JPY - Japanese Yen
  - 🇮🇩 IDR - Indonesian Rupiah
  - 🇨🇳 CNY - Chinese Yuan
  - 🇪🇹 ETB - Ethiopian Birr
  - Click on fiat value to open currency selector
  - Currency preference saved to localStorage

### New Files
- `src/lib/currency/index.ts` - Currency conversion utilities
  - `fetchAdaPrice()` - Fetch ADA price from CoinGecko
  - `convertAdaToFiat()` - Convert ADA amount to fiat
  - `formatFiatValue()` - Format fiat with proper decimals and symbols
  - `getSavedCurrency()` / `saveCurrency()` - localStorage persistence
  - `getBalanceHidden()` / `saveBalanceHidden()` - Hide balance preference

- `src/components/wallet/CurrencySelector.tsx` - Modal component for currency selection

### Changed
- `BalanceCard.tsx` - Added hide toggle, fiat display, and currency selector integration

---

## [0.3.3] - 2024-12-22 - Network Selection 🌐

### Added
- **Network Selector**: Switch between Cardano networks
  - **Preview** - Cutting-edge features testing network
  - **Pre-Production (Preprod)** - Testing network that mirrors mainnet
  - **Mainnet** - Production network with real ADA
  - Network indicator badge in dashboard header
  - Confirmation dialog before switching networks
  - Warning for mainnet (real ADA) usage
  - Network preference persisted in localStorage

### Changed
- `getCurrentNetwork()` now checks localStorage first for user preference
- `getBlockfrostUrl()` dynamically returns URL based on selected network
- `getBlockfrostApiKey()` supports per-network API keys
- Dashboard header now shows current network with colored indicator
- Switching network will lock wallet (requires PIN re-entry)

### Configuration
- `.env.local` now supports separate API keys per network:
  - `NEXT_PUBLIC_BLOCKFROST_KEY_PREVIEW`
  - `NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD`
  - `NEXT_PUBLIC_BLOCKFROST_KEY_MAINNET`

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