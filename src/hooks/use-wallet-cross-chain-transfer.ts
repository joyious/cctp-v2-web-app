"use client";

import { useState } from "react";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  HttpTransport,
  type Chain,
  type Account,
  type WalletClient,
  type Hex,
  TransactionExecutionError,
  parseUnits,
  createPublicClient,
  formatUnits,
  parseEther,
  custom,
} from "viem";
import {
  useAccount,
  useWalletClient,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import axios from "axios";
import {
  sepolia,
  avalancheFuji,
  baseSepolia,
  lineaSepolia,
  arbitrumSepolia,
  worldchainSepolia,
  optimismSepolia,
  polygonAmoy,
} from "viem/chains";
import { defineChain } from "viem";
// Solana imports
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import bs58 from "bs58";
import { hexlify } from "ethers";
// Import BN at top level like Circle's examples
import { BN } from "@coral-xyz/anchor";
import {
  SupportedChainId,
  CHAIN_IDS_TO_USDC_ADDRESSES,
  CHAIN_IDS_TO_TOKEN_MESSENGER,
  CHAIN_IDS_TO_MESSAGE_TRANSMITTER,
  DESTINATION_DOMAINS,
  CHAIN_TO_CHAIN_NAME,
  SOLANA_RPC_ENDPOINT,
  IRIS_API_URL,
} from "@/lib/chains";
import { getBytes } from "ethers";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Custom chain definitions (same as original)
const sonicBlazeTestnet = defineChain({
  id: 57054,
  name: "Sonic Blaze Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sonic",
    symbol: "SON",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.blaze.soniclabs.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Sonic Explorer",
      url: "https://blaze.soniclabs.com",
    },
  },
  testnet: true,
});

const codexTestnet = defineChain({
  id: 812242,
  name: "Codex Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Codex",
    symbol: "CDX",
  },
  rpcUrls: {
    default: {
      http: ["https://812242.rpc.thirdweb.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Codex Explorer",
      url: "https://explorer.codex-stg.xyz/",
    },
  },
  testnet: true,
});

const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Ethereum",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia.unichain.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Unichain Sepolia Explorer",
      url: "https://sepolia.uniscan.xyz",
    },
  },
  testnet: true,
});

const seiTestnet = defineChain({
  id: 1328,
  name: "Sei Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sei",
    symbol: "SEI",
  },
  rpcUrls: {
    default: {
      http: ["https://evm-rpc-testnet.sei-apis.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Sei Explorer",
      url: "https://seitrace.com",
    },
  },
  testnet: true,
});

export type TransferStep =
  | "idle"
  | "approving"
  | "burning"
  | "waiting-attestation"
  | "minting"
  | "completed"
  | "error";

const chains = {
  [SupportedChainId.ETH_SEPOLIA]: sepolia,
  [SupportedChainId.AVAX_FUJI]: avalancheFuji,
  [SupportedChainId.BASE_SEPOLIA]: baseSepolia,
  [SupportedChainId.SONIC_BLAZE]: sonicBlazeTestnet,
  [SupportedChainId.LINEA_SEPOLIA]: lineaSepolia,
  [SupportedChainId.ARBITRUM_SEPOLIA]: arbitrumSepolia,
  [SupportedChainId.WORLDCHAIN_SEPOLIA]: worldchainSepolia,
  [SupportedChainId.OPTIMISM_SEPOLIA]: optimismSepolia,
  [SupportedChainId.CODEX_TESTNET]: codexTestnet,
  [SupportedChainId.UNICHAIN_SEPOLIA]: unichainSepolia,
  [SupportedChainId.POLYGON_AMOY]: polygonAmoy,
  [SupportedChainId.SEI_TESTNET]: seiTestnet,
};

export function useWalletCrossChainTransfer() {
  const [currentStep, setCurrentStep] = useState<TransferStep>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const DEFAULT_DECIMALS = 6;

  const addLog = (message: string) =>
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);

  // Utility function to check if a chain is Solana
  const isSolanaChain = (chainId: number): boolean => {
    return chainId === SupportedChainId.SOLANA_DEVNET;
  };

  // For Solana operations, we still need to handle private keys for now
  // This is because Solana wallet adapters work differently and would need separate implementation
  const getSolanaKeypair = (privateKey: string): Keypair => {
    try {
      const privateKeyBytes = bs58.decode(privateKey);
      if (privateKeyBytes.length === 64) {
        return Keypair.fromSecretKey(privateKeyBytes);
      } else if (privateKeyBytes.length === 32) {
        return Keypair.fromSeed(privateKeyBytes);
      }
    } catch (error) {
      const cleanPrivateKey = privateKey.replace(/^0x/, "");
      if (cleanPrivateKey.length === 64) {
        const privateKeyBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          privateKeyBytes[i] = parseInt(cleanPrivateKey.substr(i * 2, 2), 16);
        }
        return Keypair.fromSeed(privateKeyBytes);
      }
    }

    throw new Error(
      "Invalid Solana private key format. Expected base58 encoded key or 32-byte hex string."
    );
  };

  const getSolanaConnection = (): Connection => {
    return new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
  };

  const getBalance = async (chainId: SupportedChainId) => {
    if (!isConnected || !address) {
      return "0";
    }

    if (isSolanaChain(chainId)) {
      // For Solana, we still need private key approach for now
      const solanaKey = process.env.NEXT_PUBLIC_SOLANA_PRIVATE_KEY;
      if (!solanaKey) {
        throw new Error("Solana private key not found in environment");
      }
      return getSolanaBalance(chainId, solanaKey);
    }
    return getEVMBalance(chainId);
  };

  const getSolanaBalance = async (
    chainId: SupportedChainId,
    privateKey: string
  ) => {
    const connection = getSolanaConnection();
    const keypair = getSolanaKeypair(privateKey);
    const usdcMint = new PublicKey(
      CHAIN_IDS_TO_USDC_ADDRESSES[chainId] as string
    );

    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        usdcMint,
        keypair.publicKey
      );

      const tokenAccount = await getAccount(connection, associatedTokenAddress);
      const balance =
        Number(tokenAccount.amount) / Math.pow(10, DEFAULT_DECIMALS);
      return balance.toString();
    } catch (error) {
      if (
        error instanceof TokenAccountNotFoundError ||
        error instanceof TokenInvalidAccountOwnerError
      ) {
        return "0";
      }
      throw error;
    }
  };

  const getEVMBalance = async (chainId: SupportedChainId) => {
    if (!publicClient || !address) {
      return "0";
    }

    const balance = await publicClient.readContract({
      address: CHAIN_IDS_TO_USDC_ADDRESSES[chainId] as `0x${string}`,
      abi: [
        {
          constant: true,
          inputs: [{ name: "_owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "balance", type: "uint256" }],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [address],
    });

    const formattedBalance = formatUnits(balance, DEFAULT_DECIMALS);
    return formattedBalance;
  };

  const approveUSDC = async (sourceChainId: number, amount: bigint) => {
    if (!walletClient) {
      throw new Error("Wallet not connected");
    }

    setCurrentStep("approving");
    addLog("Approving USDC transfer...");

    try {
      const tx = await walletClient.sendTransaction({
        to: CHAIN_IDS_TO_USDC_ADDRESSES[sourceChainId] as `0x${string}`,
        data: encodeFunctionData({
          abi: [
            {
              type: "function",
              name: "approve",
              stateMutability: "nonpayable",
              inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              outputs: [{ name: "", type: "bool" }],
            },
          ],
          functionName: "approve",
          args: [
            CHAIN_IDS_TO_TOKEN_MESSENGER[sourceChainId] as `0x${string}`,
            amount,
          ],
        }),
      });

      addLog(`USDC Approval Tx: ${tx}`);
      return tx;
    } catch (err) {
      setError("Approval failed");
      throw err;
    }
  };

  // Solana approve function (Note: SPL tokens don't require explicit approval like ERC20)
  const approveSolanaUSDC = async (keypair: Keypair, sourceChainId: number) => {
    setCurrentStep("approving");
    return "solana-approve-placeholder";
  };

  const burnUSDC = async (
    sourceChainId: number,
    amount: bigint,
    destinationChainId: number,
    destinationAddress: string,
    transferType: "fast" | "standard"
  ) => {
    if (!walletClient) {
      throw new Error("Wallet not connected");
    }

    setCurrentStep("burning");
    addLog("Burning USDC...");

    try {
      const finalityThreshold = transferType === "fast" ? 1000 : 2000;
      const maxFee = amount - 1n;

      // Handle Solana destination addresses differently
      let mintRecipient: string;
      if (isSolanaChain(destinationChainId)) {
        const usdcMint = new PublicKey(
          CHAIN_IDS_TO_USDC_ADDRESSES[SupportedChainId.SOLANA_DEVNET] as string
        );
        const destinationWallet = new PublicKey(destinationAddress);
        const tokenAccount = await getAssociatedTokenAddress(
          usdcMint,
          destinationWallet
        );
        mintRecipient = hexlify(bs58.decode(tokenAccount.toBase58()));
      } else {
        mintRecipient = `0x${destinationAddress
          .replace(/^0x/, "")
          .padStart(64, "0")}`;
      }

      const tx = await walletClient.sendTransaction({
        to: CHAIN_IDS_TO_TOKEN_MESSENGER[sourceChainId] as `0x${string}`,
        data: encodeFunctionData({
          abi: [
            {
              type: "function",
              name: "depositForBurn",
              stateMutability: "nonpayable",
              inputs: [
                { name: "amount", type: "uint256" },
                { name: "destinationDomain", type: "uint32" },
                { name: "mintRecipient", type: "bytes32" },
                { name: "burnToken", type: "address" },
                { name: "hookData", type: "bytes32" },
                { name: "maxFee", type: "uint256" },
                { name: "finalityThreshold", type: "uint32" },
              ],
              outputs: [],
            },
          ],
          functionName: "depositForBurn",
          args: [
            amount,
            DESTINATION_DOMAINS[destinationChainId],
            mintRecipient as Hex,
            CHAIN_IDS_TO_USDC_ADDRESSES[sourceChainId] as `0x${string}`,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            maxFee,
            finalityThreshold,
          ],
        }),
      });

      addLog(`Burn Tx: ${tx}`);
      return tx;
    } catch (err) {
      setError("Burn failed");
      throw err;
    }
  };

  // Keep Solana functions mostly the same but using the keypair parameter
  const burnSolanaUSDC = async (
    keypair: Keypair,
    sourceChainId: number,
    amount: bigint,
    destinationChainId: number,
    destinationAddress: string,
    transferType: "fast" | "standard"
  ) => {
    setCurrentStep("burning");
    addLog("Burning Solana USDC...");

    try {
      const {
        getAnchorConnection,
        getPrograms,
        getDepositForBurnPdas,
        evmAddressToBytes32,
        findProgramAddress,
      } = await import("@/lib/solana-utils");
      const {
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        getAccount,
      } = await import("@solana/spl-token");

      const connection = getSolanaConnection();
      const provider = getAnchorConnection(keypair, SOLANA_RPC_ENDPOINT);
      const { messageTransmitterProgram, tokenMessengerMinterProgram } =
        getPrograms(provider);

      const usdcMint = new PublicKey(
        CHAIN_IDS_TO_USDC_ADDRESSES[SupportedChainId.SOLANA_DEVNET] as string
      );

      const pdas = getDepositForBurnPdas(
        { messageTransmitterProgram, tokenMessengerMinterProgram },
        usdcMint,
        DESTINATION_DOMAINS[destinationChainId]
      );

      const messageSentEventAccountKeypair = Keypair.generate();
      const userTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        keypair.publicKey
      );

      let mintRecipient: PublicKey;

      if (isSolanaChain(destinationChainId)) {
        mintRecipient = new PublicKey(destinationAddress);
      } else {
        const cleanAddress = destinationAddress
          .replace(/^0x/, "")
          .toLowerCase();
        if (cleanAddress.length !== 40) {
          throw new Error(
            `Invalid EVM address length: ${cleanAddress.length}, expected 40`
          );
        }
        const formattedAddress = `0x${cleanAddress}`;
        const bytes32Address = evmAddressToBytes32(formattedAddress);
        mintRecipient = new PublicKey(getBytes(bytes32Address));
      }

      // Use connected wallet address for destination caller
      const destinationCaller = new PublicKey(
        getBytes(evmAddressToBytes32(address!))
      );

      const depositForBurnTx = await (
        tokenMessengerMinterProgram as any
      ).methods
        .depositForBurn({
          amount: new BN(amount.toString()),
          destinationDomain: DESTINATION_DOMAINS[destinationChainId],
          mintRecipient,
          maxFee: new BN((amount - 1n).toString()),
          minFinalityThreshold: transferType === "fast" ? 1000 : 2000,
          destinationCaller,
        })
        .accounts({
          owner: keypair.publicKey,
          eventRentPayer: keypair.publicKey,
          senderAuthorityPda: pdas.authorityPda.publicKey,
          burnTokenAccount: userTokenAccount,
          messageTransmitter: pdas.messageTransmitterAccount.publicKey,
          tokenMessenger: pdas.tokenMessengerAccount.publicKey,
          remoteTokenMessenger: pdas.remoteTokenMessengerKey.publicKey,
          tokenMinter: pdas.tokenMinterAccount.publicKey,
          localToken: pdas.localToken.publicKey,
          burnTokenMint: usdcMint,
          messageSentEventData: messageSentEventAccountKeypair.publicKey,
          messageTransmitterProgram: messageTransmitterProgram.programId,
          tokenMessengerMinterProgram: tokenMessengerMinterProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([messageSentEventAccountKeypair])
        .rpc();

      addLog(`Solana burn transaction: ${depositForBurnTx}`);
      return depositForBurnTx;
    } catch (err) {
      setError("Solana burn failed");
      addLog(
        `Solana burn error: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      throw err;
    }
  };

  const retrieveAttestation = async (
    transactionHash: string,
    sourceChainId: number
  ) => {
    setCurrentStep("waiting-attestation");
    addLog("Retrieving attestation...");

    const url = `${IRIS_API_URL}/v2/messages/${DESTINATION_DOMAINS[sourceChainId]}?transactionHash=${transactionHash}`;

    while (true) {
      try {
        const response = await axios.get(url);
        if (response.data?.messages?.[0]?.status === "complete") {
          addLog("Attestation retrieved!");
          return response.data.messages[0];
        }
        addLog("Waiting for attestation...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        setError("Attestation retrieval failed");
        addLog(
          `Attestation error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        throw error;
      }
    }
  };

  const mintUSDC = async (destinationChainId: number, attestation: any) => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    const MAX_RETRIES = 5;
    let retries = 0;
    setCurrentStep("minting");
    addLog("Minting USDC...");

    while (retries < MAX_RETRIES) {
      try {
        // Create a fresh wallet client for the destination chain to ensure it's on the correct chain
        const destinationWalletClient = createWalletClient({
          chain: chains[destinationChainId as keyof typeof chains],
          transport: custom(window.ethereum!),
          account: address,
        });

        const tx = await destinationWalletClient.sendTransaction({
          to: CHAIN_IDS_TO_MESSAGE_TRANSMITTER[
            destinationChainId
          ] as `0x${string}`,
          data: encodeFunctionData({
            abi: [
              {
                type: "function",
                name: "receiveMessage",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "message", type: "bytes" },
                  { name: "attestation", type: "bytes" },
                ],
                outputs: [],
              },
            ],
            functionName: "receiveMessage",
            args: [attestation.message, attestation.attestation],
          }),
        });

        addLog(`Mint Tx: ${tx}`);
        setCurrentStep("completed");
        break;
      } catch (err) {
        if (err instanceof TransactionExecutionError && retries < MAX_RETRIES) {
          retries++;
          console.log(err);
          addLog(`Retry ${retries}/${MAX_RETRIES}...`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
          continue;
        }
        throw err;
      }
    }
  };

  // Keep Solana mint function mostly the same
  const mintSolanaUSDC = async (
    keypair: Keypair,
    destinationChainId: number,
    attestation: any
  ) => {
    setCurrentStep("minting");
    addLog("Minting Solana USDC...");

    try {
      const {
        getAnchorConnection,
        getPrograms,
        getReceiveMessagePdas,
        decodeNonceFromMessage,
        evmAddressToBytes32,
      } = await import("@/lib/solana-utils");
      const {
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        getAccount,
      } = await import("@solana/spl-token");

      const provider = getAnchorConnection(keypair, SOLANA_RPC_ENDPOINT);
      const { messageTransmitterProgram, tokenMessengerMinterProgram } =
        getPrograms(provider);
      const connection = getSolanaConnection();

      const usdcMint = new PublicKey(
        CHAIN_IDS_TO_USDC_ADDRESSES[SupportedChainId.SOLANA_DEVNET] as string
      );
      const messageHex = attestation.message;
      const attestationHex = attestation.attestation;

      const nonce = decodeNonceFromMessage(messageHex);
      const messageBuffer = Buffer.from(messageHex.replace("0x", ""), "hex");
      const sourceDomain = messageBuffer.readUInt32BE(4);

      let remoteTokenAddressHex = "";
      for (const [chainId, usdcAddress] of Object.entries(
        CHAIN_IDS_TO_USDC_ADDRESSES
      )) {
        if (
          DESTINATION_DOMAINS[parseInt(chainId)] === sourceDomain &&
          !isSolanaChain(parseInt(chainId))
        ) {
          remoteTokenAddressHex = evmAddressToBytes32(usdcAddress as string);
          break;
        }
      }

      const pdas = await getReceiveMessagePdas(
        { messageTransmitterProgram, tokenMessengerMinterProgram },
        usdcMint,
        remoteTokenAddressHex,
        sourceDomain.toString(),
        nonce
      );

      const userTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        keypair.publicKey
      );

      const accountMetas = [
        {
          isSigner: false,
          isWritable: false,
          pubkey: pdas.tokenMessengerAccount.publicKey,
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: pdas.remoteTokenMessengerKey.publicKey,
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: pdas.tokenMinterAccount.publicKey,
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: pdas.localToken.publicKey,
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: pdas.tokenPair.publicKey,
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: pdas.feeRecipientTokenAccount,
        },
        { isSigner: false, isWritable: true, pubkey: userTokenAccount },
        {
          isSigner: false,
          isWritable: true,
          pubkey: pdas.custodyTokenAccount.publicKey,
        },
        { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
        {
          isSigner: false,
          isWritable: false,
          pubkey: pdas.tokenMessengerEventAuthority.publicKey,
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: tokenMessengerMinterProgram.programId,
        },
      ];

      const receiveMessageTx = await (messageTransmitterProgram as any).methods
        .receiveMessage({
          message: Buffer.from(messageHex.replace("0x", ""), "hex"),
          attestation: Buffer.from(attestationHex.replace("0x", ""), "hex"),
        })
        .accounts({
          payer: keypair.publicKey,
          caller: keypair.publicKey,
          authorityPda: pdas.authorityPda,
          messageTransmitter: pdas.messageTransmitterAccount.publicKey,
          usedNonce: pdas.usedNonce,
          receiver: tokenMessengerMinterProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(accountMetas)
        .signers([keypair])
        .rpc();

      addLog(`Solana mint transaction: ${receiveMessageTx}`);
      setCurrentStep("completed");
      return receiveMessageTx;
    } catch (err) {
      console.error("Full Solana mint error:", err);
      setError("Solana mint failed");
      addLog(
        `Solana mint error: ${
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : JSON.stringify(err)
        }`
      );
      throw err;
    }
  };

  const executeTransfer = async (
    sourceChainId: number,
    destinationChainId: number,
    amount: string
  ) => {
    if (!isConnected || !address) {
      throw new Error("Wallet not connected");
    }

    try {
      const numericAmount = parseUnits(amount, DEFAULT_DECIMALS);

      // Handle different chain types
      const isSourceSolana = isSolanaChain(sourceChainId);
      const isDestinationSolana = isSolanaChain(destinationChainId);

      // Check if we need to switch to source chain
      if (!isSourceSolana && chain?.id !== sourceChainId) {
        addLog(`Switching to ${CHAIN_TO_CHAIN_NAME[sourceChainId]}...`);
        await switchChain({ chainId: sourceChainId });
        // Wait a bit for the switch to complete
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      let sourceClient: any, destinationClient: any, defaultDestination: string;

      if (isSourceSolana) {
        // For Solana source, we still need private key approach
        const solanaKey = process.env.NEXT_PUBLIC_SOLANA_PRIVATE_KEY;
        if (!solanaKey) {
          throw new Error("Solana private key not found in environment");
        }
        sourceClient = getSolanaKeypair(solanaKey);
      }

      if (isDestinationSolana) {
        // For Solana destination, we still need private key approach
        const solanaKey = process.env.NEXT_PUBLIC_SOLANA_PRIVATE_KEY;
        if (!solanaKey) {
          throw new Error("Solana private key not found in environment");
        }
        destinationClient = getSolanaKeypair(solanaKey);
        defaultDestination = destinationClient.publicKey.toString();
      } else {
        // For EVM destination, use connected wallet address
        defaultDestination = address;
      }

      // Execute approve step
      if (isSourceSolana) {
        await approveSolanaUSDC(sourceClient, sourceChainId);
      } else {
        await approveUSDC(sourceChainId, numericAmount);
      }

      // Execute burn step
      let burnTx: string;
      if (isSourceSolana) {
        burnTx = await burnSolanaUSDC(
          sourceClient,
          sourceChainId,
          numericAmount,
          destinationChainId,
          defaultDestination,
          "fast" // Default to fast for now
        );
      } else {
        burnTx = await burnUSDC(
          sourceChainId,
          numericAmount,
          destinationChainId,
          defaultDestination,
          "fast" // Default to fast for now
        );
      }

      // Retrieve attestation
      const attestation = await retrieveAttestation(burnTx, sourceChainId);

      // Check if we need to switch to destination chain
      if (!isDestinationSolana && chain?.id !== destinationChainId) {
        addLog(`Switching to ${CHAIN_TO_CHAIN_NAME[destinationChainId]}...`);
        await switchChain({ chainId: destinationChainId });
        // Wait a bit for the switch to complete
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Execute mint step
      if (isDestinationSolana) {
        await mintSolanaUSDC(
          destinationClient,
          destinationChainId,
          attestation
        );
      } else {
        await mintUSDC(destinationChainId, attestation);
      }
    } catch (error) {
      setCurrentStep("error");
      addLog(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const reset = () => {
    setCurrentStep("idle");
    setLogs([]);
    setError(null);
  };

  return {
    currentStep,
    logs,
    error,
    executeTransfer,
    getBalance,
    reset,
    isConnected,
    address,
    chainId: chain?.id,
  };
}
