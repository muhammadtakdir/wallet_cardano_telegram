# Cardano Wallet - Telegram Mini App

A non-custodial Cardano wallet built as a Telegram Mini App. All private keys are encrypted and stored locally on the user's device - we never have access to your funds.

## 🚀 Tech Stack

- **Framework:** Next.js 14+ (App Router) with TypeScript
- **Styling:** Tailwind CSS (Mobile-first)
- **Cardano SDK:** MeshJS (@meshsdk/core, @meshsdk/react)
- **State Management:** Zustand
- **Telegram Integration:** @twa-dev/sdk
- **Encryption:** CryptoJS (AES-256)
- **Mnemonic:** BIP-39 standard

## 📁 Project Structure

```
/src
├── /app                    # Next.js App Router pages
│   ├── globals.css         # Global styles + Telegram theme vars
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx            # Main wallet page
├── /components
│   ├── /ui                 # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── PinInput.tsx
│   ├── /wallet             # Wallet-specific components
│   │   ├── BalanceCard.tsx
│   │   ├── MnemonicDisplay.tsx
│   │   ├── TransactionList.tsx
│   │   └── WalletDashboard.tsx
│   └── /providers          # Context providers
│       └── Providers.tsx   # MeshProvider wrapper
├── /hooks
│   ├── useTelegram.ts      # Telegram WebApp integration
│   └── useWalletStore.ts   # Zustand wallet state
└── /lib
    ├── /cardano            # Cardano/MeshJS utilities
    │   ├── mnemonic.ts     # BIP-39 mnemonic functions
    │   ├── types.ts        # Type definitions
    │   └── wallet.ts       # Wallet operations
    └── /storage            # Local storage utilities
        ├── encryption.ts   # AES encryption helpers
        └── index.ts        # Storage helpers
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Blockfrost API key (get one at https://blockfrost.io)

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd wallet_cardano_telegram
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your Blockfrost API key:
   ```env
   NEXT_PUBLIC_CARDANO_NETWORK=preprod
   NEXT_PUBLIC_BLOCKFROST_API_KEY=your_blockfrost_api_key_here
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3000`

## 🔐 Security Features

- **Client-Side Only:** All private key operations happen in the browser
- **AES-256 Encryption:** Mnemonic phrases are encrypted with user PIN
- **PBKDF2 Key Derivation:** 100,000 iterations for secure key derivation
- **No Server Storage:** We never store or transmit your keys
- **PIN Protection:** Wallet requires PIN to unlock

## 📱 Telegram Integration

### Testing in Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set up a Mini App with your deployed URL
3. Configure the web app URL in BotFather

### Environment Detection

The app automatically detects if it's running inside Telegram and enables:
- Native haptic feedback
- Telegram theme synchronization
- Native popups and alerts
- Viewport management

## 🏗️ Building for Production

```bash
npm run build
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo)

```bash
vercel
```

## 📋 Features (Phase 1)

- [x] Environment detection (Telegram vs Browser)
- [x] Generate new wallet (BIP-39 mnemonic)
- [x] Import existing wallet
- [x] PIN encryption for mnemonic storage
- [x] View ADA balance
- [x] View transaction history
- [x] Copy wallet address
- [x] Lock/Unlock wallet
- [x] Mobile-responsive UI

## 🔜 Roadmap (Phase 2+)

- [ ] Send ADA transactions
- [ ] Receive with QR code
- [ ] Native asset support (NFTs, tokens)
- [ ] Escrow smart contract integration
- [ ] Multi-wallet support
- [ ] Transaction signing
- [ ] Address book

## ⚠️ Important Notes

1. **WASM Support:** MeshJS requires WebAssembly. The `next.config.ts` is pre-configured to handle this.

2. **Testnet First:** The app defaults to Cardano Preprod testnet. Change `NEXT_PUBLIC_CARDANO_NETWORK` to `mainnet` for production.

3. **Backup Your Phrase:** Always backup your 24-word recovery phrase. Losing it means losing access to your funds forever.

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
