# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
