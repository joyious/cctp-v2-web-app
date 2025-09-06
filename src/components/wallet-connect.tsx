'use client'

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useState, useEffect } from 'react'
import { SupportedChainId, CHAIN_TO_CHAIN_NAME } from '@/lib/chains'

interface WalletConnectProps {
  requiredChainId?: SupportedChainId
  onWalletConnected?: (account: `0x${string}`, chainId: number) => void
  onWalletDisconnected?: () => void
}

export function WalletConnect({ 
  requiredChainId, 
  onWalletConnected, 
  onWalletDisconnected 
}: WalletConnectProps) {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [isWrongNetwork, setIsWrongNetwork] = useState(false)

  useEffect(() => {
    if (requiredChainId && isConnected) {
      setIsWrongNetwork(chainId !== requiredChainId)
    } else {
      setIsWrongNetwork(false)
    }
  }, [chainId, requiredChainId, isConnected])

  useEffect(() => {
    if (isConnected && address && !isWrongNetwork) {
      onWalletConnected?.(address, chainId)
    } else {
      onWalletDisconnected?.()
    }
  }, [isConnected, address, chainId, isWrongNetwork, onWalletConnected, onWalletDisconnected])

  const handleSwitchNetwork = () => {
    if (requiredChainId) {
      switchChain({ chainId: requiredChainId })
    }
  }

  const handleDisconnect = () => {
    disconnect()
    onWalletDisconnected?.()
  }

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Connect Your Wallet</h3>
          <div className="space-y-2">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                onClick={() => connect({ connector })}
                className="w-full"
                variant="outline"
              >
                Connect {connector.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isWrongNetwork && requiredChainId) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-2">Wrong Network</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Please switch to {CHAIN_TO_CHAIN_NAME[requiredChainId]} to continue
          </p>
          <div className="flex gap-2">
            <Button onClick={handleSwitchNetwork}>
              Switch to {CHAIN_TO_CHAIN_NAME[requiredChainId]}
            </Button>
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-2">Wallet Connected</h3>
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">Address:</span> {address}
          </p>
          <p className="text-sm">
            <span className="font-medium">Network:</span> {CHAIN_TO_CHAIN_NAME[chainId as SupportedChainId] || 'Unknown'}
          </p>
          <Button variant="outline" onClick={handleDisconnect} className="w-full">
            Disconnect Wallet
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}