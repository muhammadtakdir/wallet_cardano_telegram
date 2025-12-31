import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack for MeshJS WASM support (Turbopack doesn't fully support WASM yet)
  // Enable WebAssembly support for MeshJS/Cardano libraries
  webpack: (config, { isServer }) => {
    // Enable WASM experiments
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };

    // Fix for packages that use fs, net, tls (common in crypto libraries)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    // Ignore WASM files in server-side rendering to prevent issues
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@meshsdk/core": "commonjs @meshsdk/core",
        "@lucid-evolution/lucid": "commonjs @lucid-evolution/lucid",
        "@lucid-evolution/utils": "commonjs @lucid-evolution/utils",
      });
    }

    return config;
  },

  // Empty turbopack config to allow webpack config
  turbopack: {},

  // Required for Telegram WebApp and external API calls
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },

  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_BLOCKFROST_API_KEY: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY,
    NEXT_PUBLIC_CARDANO_NETWORK: process.env.NEXT_PUBLIC_CARDANO_NETWORK || "preprod",
    DEXHUNTER_API_HEADER: process.env.DEXHUNTER_API_HEADER,
    DEXHUNTER_PARTNER_NAME: process.env.DEXHUNTER_PARTNER_NAME,
  },

  // Vercel optimization
  reactStrictMode: true,

  // Allow images from IPFS and other sources
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ipfs.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "gateway.pinata.cloud",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.dexhunt.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "app.dexhunter.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "tokens.muesliswap.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
