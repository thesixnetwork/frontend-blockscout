import { useQuery } from '@tanstack/react-query';
import { readContract } from '@wagmi/core';

import appConfig from 'configs/app';
import type { Address } from 'types/api/address';
import wagmiConfig from 'lib/web3/wagmiConfig';

interface RWANoteData {
  id: string;          // API returns "id" not "_id"
  contractAddress: string;
  contractOwnerAddress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface UseCheckRWANoteEligibilityResult {
  isOwner: boolean;
  hasNote: boolean;
  noteData: RWANoteData | null;
  isCheckingOwner: boolean;
  isCheckingNote: boolean;
}

// Derive network name from chain ID (98 = sixnet, 150 = fivenet)
function getNetworkName(): 'sixnet' | 'fivenet' {
  const id = Number(appConfig.chain.id);
  if (id === 150) return 'fivenet';
  return 'sixnet';
}

// Check if the token already has an RWA note and return the data
async function fetchRWANote(tokenAddress: string): Promise<RWANoteData | null> {
  try {
    const network = getNetworkName();
    const response = await fetch(`/node-api/rwa-note?endpoint=${encodeURIComponent(`/${network}/rwa-notes/by-contract/${tokenAddress}`)}`);

    if (response.status === 404) {
      return null;
    }

    if (response.ok) {
      const data = await response.json() as RWANoteData;
      return data;
    }

    throw new Error('Failed to check RWA note status');
  } catch (error) {
    return null;
  }
}

// Minimal ABI for the owner() function from Ownable pattern
const OWNER_ABI = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Fetch the deployer (creator) address from the Blockscout scanner API
async function fetchDeployerAddress(tokenAddress: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/v2/addresses/${tokenAddress}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as Address;
    return data.creator_address_hash ?? null;
  } catch (error) {
    return null;
  }
}

// Check if the connected wallet is the owner() OR the deployer of the token contract
async function checkTokenEligibility(
  tokenAddress: string,
  walletAddress: string,
): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();

  // Run owner() call and deployer fetch in parallel
  const [ contractOwner, deployerAddress ] = await Promise.all([
    readContract(wagmiConfig.config, {
      address: tokenAddress as `0x${string}`,
      abi: OWNER_ABI,
      functionName: 'owner',
    }).catch(() => null),
    fetchDeployerAddress(tokenAddress),
  ]);

  if (contractOwner && (contractOwner as string).toLowerCase() === wallet) {
    return true;
  }

  if (deployerAddress && deployerAddress.toLowerCase() === wallet) {
    return true;
  }

  return false;
}

export default function useCheckRWANoteEligibility(
  tokenAddress: string,
  walletAddress?: string,
): UseCheckRWANoteEligibilityResult {
  // Check if note exists and get the data
  const { data: noteData = null, isLoading: isCheckingNote } = useQuery({
    queryKey: [ 'rwa-note-exists', tokenAddress ],
    queryFn: () => fetchRWANote(tokenAddress),
    enabled: Boolean(tokenAddress),
    staleTime: 30000,
  });

  const hasNote = noteData !== null;

  // Check ownership (owner() on-chain) AND deployer (scanner API) in one query
  const ownershipQuery = useQuery({
    queryKey: [ 'token-eligibility', tokenAddress, walletAddress ],
    queryFn: () => checkTokenEligibility(tokenAddress, walletAddress!),
    enabled: Boolean(tokenAddress && walletAddress),
    staleTime: 60000,
  });

  const isOwner = ownershipQuery.data ?? false;
  const isCheckingOwner = ownershipQuery.isLoading;

  return {
    isOwner,
    hasNote,
    noteData,
    isCheckingOwner,
    isCheckingNote,
  };
}
