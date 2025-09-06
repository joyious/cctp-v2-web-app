import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, avalancheFuji, baseSepolia, arbitrumSepolia, optimismSepolia, lineaSepolia, polygonAmoy } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

// Custom chain definitions for unsupported chains
const sonicBlazeTestnet = defineChain({
  id: 57054,
  name: 'Sonic Blaze Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Sonic',
    symbol: 'SON'
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.blaze.soniclabs.com']
    }
  },
  blockExplorers: {
    default: {
      name: 'Sonic Explorer',
      url: 'https://blaze.soniclabs.com'
    }
  },
  testnet: true
})

const worldchainSepolia = defineChain({
  id: 4801,  
  name: 'Worldchain Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH'
  },
  rpcUrls: {
    default: {
      http: ['https://worldchain-sepolia.g.alchemy.com/public']
    }
  },
  blockExplorers: {
    default: {
      name: 'Worldchain Sepolia Explorer',
      url: 'https://worldchain-sepolia.explorer.alchemy.com'
    }
  },
  testnet: true
})

const codexTestnet = defineChain({
  id: 812242,
  name: 'Codex Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Codex',
    symbol: 'CDX'
  },
  rpcUrls: {
    default: {
      http: ['https://812242.rpc.thirdweb.com']
    }
  },
  blockExplorers: {
    default: {
      name: 'Codex Explorer',
      url: 'https://explorer.codex-stg.xyz/'
    }
  },
  testnet: true
})

const unichainSepolia = defineChain({
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH'
  },
  rpcUrls: {
    default: {
      http: ['https://sepolia.unichain.org']
    }
  },
  blockExplorers: {
    default: {
      name: 'Unichain Sepolia Explorer',
      url: 'https://sepolia.uniscan.xyz'
    }
  },
  testnet: true
})

const seiTestnet = defineChain({
  id: 1328,
  name: 'Sei Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Sei',
    symbol: 'SEI'
  },
  rpcUrls: {
    default: {
      http: ['https://evm-rpc-testnet.sei-apis.com']
    }
  },
  blockExplorers: {
    default: {
      name: 'Sei Explorer',
      url: 'https://seitrace.com'
    }
  },
  testnet: true
})

export const config = createConfig({
  chains: [
    sepolia,
    avalancheFuji,
    baseSepolia,
    sonicBlazeTestnet,
    lineaSepolia,
    arbitrumSepolia,
    worldchainSepolia,
    optimismSepolia,
    codexTestnet,
    unichainSepolia,
    polygonAmoy,
    seiTestnet,
  ],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id',
    }),
  ],
  transports: {
    [sepolia.id]: http(),
    [avalancheFuji.id]: http(),
    [baseSepolia.id]: http(),
    [sonicBlazeTestnet.id]: http(),
    [lineaSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [worldchainSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [codexTestnet.id]: http(),
    [unichainSepolia.id]: http(),
    [polygonAmoy.id]: http(),
    [seiTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}