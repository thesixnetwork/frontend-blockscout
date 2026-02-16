import {
  Box,
  Text,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { Skeleton } from 'toolkit/chakra/skeleton';

interface RWANoteData {
  _id: string;
  contractAddress: string;
  contractOwnerAddress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  tokenAddress: string;
}

async function fetchRWANote(tokenAddress: string): Promise<RWANoteData | null> {
  try {
    const response = await fetch(`/node-api/rwa-note?endpoint=/rwa-notes/by-contract/${tokenAddress}`);
    
    if (response.status === 404) {
      return null; // No note exists
    }
    
    if (response.ok) {
      const data = await response.json();
      return data as RWANoteData;
    }
    
    throw new Error('Failed to fetch RWA note');
  } catch (error) {
    return null;
  }
}

const RWANoteDisplay = ({ tokenAddress }: Props) => {
  const { data: noteData, isLoading } = useQuery({
    queryKey: [ 'rwa-note', tokenAddress ],
    queryFn: () => fetchRWANote(tokenAddress),
    enabled: Boolean(tokenAddress),
    staleTime: 30000, // 30 seconds
  });

  // Show skeleton while loading
  if (isLoading) {
    return (
      <Box mt={4}>
        <Skeleton height="60px" borderRadius="md" loading={ true }/>
      </Box>
    );
  }

  // Don't render anything if there's no note
  if (!noteData) {
    return null;
  }

  return (
    <Box
      mt={4}
      p={4}
      bg="gray.50"
      _dark={{ bg: 'gray.800' }}
      borderRadius="md"
      mb={4}
    >
      <Text fontSize="md">
        <Text as="span" fontWeight="bold">RWA Note:</Text> {noteData.note}
      </Text>
    </Box>
  );
};

export default RWANoteDisplay;
