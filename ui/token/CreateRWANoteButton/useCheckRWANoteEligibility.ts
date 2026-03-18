import { useQuery } from '@tanstack/react-query';
import { readContract } from '@wagmi/core';

import appConfig from 'configs/app';
import useApiQuery from 'lib/api/useApiQuery';
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
  isDeployer: boolean;
  hasNote: boolean;
  noteData: RWANoteData | null;
  isCheckingOwner: boolean;
  isCheckingNote: boolean;
  isCheckingDeployer: boolean;
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
    // Use Next.js API route to proxy the request and avoid CSP issues
    const response = await fetch(`/node-api/rwa-note?endpoint=${encodeURIComponent(`/${network}/rwa-notes/by-contract/${tokenAddress}`)}`);

    if (response.status === 404) {
      return null; // No note exists
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

  // ── Primary check: Blockscout API (/api/v2/addresses/:hash) ──────────────
  // Returns creator_address_hash when the internal-transactions indexer has
  // run. On sixnet mainnet INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true
  // so contracts deployed after that flag was set will have creator_address_hash=null.
  const addressQuery = useApiQuery('general:address', {
    pathParams: { hash: tokenAddress },
    queryOptions: {
      enabled: Boolean(tokenAddress),
      staleTime: 3_600_000, // 60 minutes – deployer never changes
    },
  });

  const creatorFromBlockscout = addressQuery.data?.creator_address_hash ?? null;

  // ── Fallback check: on-chain owner() call ────────────────────────────────
  // Activated only after Blockscout confirms it has no creator info (null).
  // Covers mainnet where internal-tx indexing is disabled and historical
  // creator data was never backfilled.
  const needsOwnerFallback = addressQuery.isSuccess && creatorFromBlockscout === null;

  const { data: ownerFromChain = null, isLoading: isCheckingOwnerFallback } = useQuery({
    queryKey: [ 'contract-owner-fallback', tokenAddress ],
    queryFn: async() => {
      try {
        const owner = await readContract(wagmiConfig.config, {
          address: tokenAddress as `0x${string}`,
          abi: [ {
            inputs: [],
            name: 'owner',
            outputs: [ { internalType: 'address', name: '', type: 'address' } ],
            stateMutability: 'view',
            type: 'function',
          } ] as const,
          functionName: 'owner',
        });
        return (owner as string) ?? null;
      } catch {
        // Contract may not implement Ownable – not an error
        return null;
      }
    },
    enabled: Boolean(tokenAddress) && needsOwnerFallback,
    staleTime: 3_600_000, // 60 minutes
  });

  // Prefer Blockscout deployer; fall back to on-chain owner()
  const authorityAddress = creatorFromBlockscout ?? ownerFromChain;

  const isDeployer = Boolean(
    walletAddress &&
    authorityAddress &&
    authorityAddress.toLowerCase() === walletAddress.toLowerCase(),
  );

  const isCheckingDeployer =
    addressQuery.isLoading || (needsOwnerFallback && isCheckingOwnerFallback);

  const isOwner = isDeployer;
  const isCheckingOwner = isCheckingDeployer;

  return {
    isOwner,
    isDeployer,
    hasNote,
    noteData,
    isCheckingOwner,
    isCheckingNote,
    isCheckingDeployer,
  };
}
