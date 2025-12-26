import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack for MeshJS WASM support (Turbopack doesn't fully support WASM yet)
  // Enable WebAssembly support for MeshJS/Cardano libraries
  webpack: (config, { isServer }) => {
    // Enable WASM experiments
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };

    // Handle WASM file loading
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    // Fix for WASM loading in Next.js
    config.output.webassemblyModuleFilename = "static/wasm/[modulehash].wasm";

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
        "lucid-cardano": "commonjs lucid-cardano",
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
  },

  // Vercel optimization
  reactStrictMode: true,

  serverExternalPackages: ["@meshsdk/core", "lucid-cardano"],

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
    ],
  },
};

export default nextConfig;
