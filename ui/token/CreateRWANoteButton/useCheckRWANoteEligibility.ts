import { useQuery } from '@tanstack/react-query';

import appConfig from 'configs/app';
import useApiQuery from 'lib/api/useApiQuery';

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

  // Fetch address info from Blockscout to check the contract deployer.
  // /api/v2/addresses/:hash returns creator_address_hash (same-origin, no CORS issue).
  const addressQuery = useApiQuery('general:address', {
    pathParams: { hash: tokenAddress },
    queryOptions: {
      enabled: Boolean(tokenAddress),
      staleTime: 3_600_000, // 60 minutes – deployer never changes
    },
  });

  const isDeployer = Boolean(
    walletAddress &&
    addressQuery.data?.creator_address_hash &&
    addressQuery.data.creator_address_hash.toLowerCase() === walletAddress.toLowerCase(),
  );
  const isCheckingDeployer = addressQuery.isLoading;

  // Legacy owner() check kept for backwards compatibility but no longer used by the button.
  const isOwner = false;
  const isCheckingOwner = false;

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
