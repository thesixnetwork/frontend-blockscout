import { useQuery } from '@tanstack/react-query';
import { readContract } from '@wagmi/core';

import wagmiConfig from 'lib/web3/wagmiConfig';

interface RWANoteData {
  _id: string;
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

// Check if the token already has an RWA note and return the data
async function fetchRWANote(tokenAddress: string): Promise<RWANoteData | null> {
  try {
    // Use Next.js API route to proxy the request and avoid CSP issues
    const response = await fetch(`/api/rwa-note-proxy?endpoint=/rwa-notes/by-contract/${tokenAddress}`);
    
    if (response.status === 404) {
      return null; // No note exists
    }
    
    if (response.ok) {
      const data = await response.json();
      return data as RWANoteData;
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

// Check if the connected wallet is the owner of the token contract
async function checkTokenOwnership(tokenAddress: string, walletAddress: string): Promise<boolean> {
  try {
    // Call the owner() function on the ERC-20 contract
    const contractOwner = await readContract(wagmiConfig.config, {
      address: tokenAddress as `0x${string}`,
      abi: OWNER_ABI,
      functionName: 'owner',
    });
    
    // Compare addresses
    if (contractOwner && contractOwner.toLowerCase() === walletAddress.toLowerCase()) {
      return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
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
    staleTime: 30000, // 30 seconds
  });

  const hasNote = noteData !== null;

  // Check ownership
  const ownershipQuery = useQuery({
    queryKey: [ 'token-ownership', tokenAddress, walletAddress ],
    queryFn: () => checkTokenOwnership(tokenAddress, walletAddress!),
    enabled: Boolean(tokenAddress && walletAddress),
    staleTime: 60000, // 1 minute
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
