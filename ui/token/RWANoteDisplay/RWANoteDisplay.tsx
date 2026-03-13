import {
  Box,
  Flex,
  Text,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { Skeleton } from 'toolkit/chakra/skeleton';

// Safely parse a note string that may contain <Link href="...">text</Link> tags.
// Only http/https URLs are allowed; everything else is rendered as plain text.
function parseNoteWithLinks(note: string): Array<React.ReactNode> {
  const LINK_RE = /<Link\s+href="([^"]*)">([^<]*)<\/Link>/g;
  const nodes: Array<React.ReactNode> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_RE.exec(note)) !== null) {
    // Plain text before this link
    if (match.index > lastIndex) {
      nodes.push(note.slice(lastIndex, match.index));
    }

    const href = match[1];
    const label = match[2];

    // Only allow http / https to prevent javascript: and other dangerous schemes
    let isSafeUrl = false;
    try {
      const parsed = new URL(href);
      isSafeUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      isSafeUrl = false;
    }

    if (isSafeUrl) {
      nodes.push(
        <a
          key={ match.index }
          href={ href }
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2F6FD6', textDecoration: 'underline' }}
        >
          { label }
        </a>,
      );
    } else {
      // Unsafe URL – render as plain text
      nodes.push(label);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text after the last link
  if (lastIndex < note.length) {
    nodes.push(note.slice(lastIndex));
  }

  return nodes;
}

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
    queryKey: ['rwa-note', tokenAddress],
    queryFn: () => fetchRWANote(tokenAddress),
    enabled: Boolean(tokenAddress),
    staleTime: 30000, // 30 seconds
  });

  // Show skeleton while loading
  if (isLoading) {
    return (
      <Box mt={4}>
        <Skeleton height="60px" borderRadius="md" loading={true} />
      </Box>
    );
  }

  // Don't render anything if there's no note
  if (!noteData) {
    return null;
  }

  return (
    <Box
      
      mb={4}
      p="18px"
      display="inline-flex"
      maxWidth="100%"
      bg="linear-gradient(180deg,#F6FAFF 0%, #EEF5FF 100%)"
      border="1px solid"
      borderColor="#8FB8E8"
      borderRadius="12px"
      boxShadow="0px 4px 14px rgba(56, 113, 201, 0.12)"
    >
      <Flex align="center" gap={5}>

        <Text fontSize="14px" color="#3A4A5B" lineHeight="1.6">
          <Text as="span" fontWeight="600" color="#1F3B5B">
            RWA Disclosure:
          </Text>{" "}
          { parseNoteWithLinks(noteData.note) }
        </Text>

        <Box flexShrink={0} opacity={0.95} >
          <svg width="44" height="44" viewBox="0 0 52 52" fill="none">
            <path
              d="M26 4L8 11V24C8 34.5 16.1 44.3 26 47C35.9 44.3 44 34.5 44 24V11L26 4Z"
              fill="rgba(47,111,214,0.15)"
              stroke="#2F6FD6"
              strokeWidth="2"
            />
            <path
              d="M26 6L10 12.5V24C10 33.7 17.4 42.7 26 45.2C34.6 42.7 42 33.7 42 24V12.5L26 6Z"
              fill="#2F6FD6"
            />
            <path
              d="M18 26L23 31L34 20"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Box>

      </Flex>
    </Box>
  );
};

export default RWANoteDisplay;
