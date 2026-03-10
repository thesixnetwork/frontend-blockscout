import {
  Flex,
  Input,
  Text,
} from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { waitForTransactionReceipt } from '@wagmi/core';
import React from 'react';
import { useWriteContract, useReadContract } from 'wagmi';

import config from 'configs/app';
import wagmiConfig from 'lib/web3/wagmiConfig';
import { Button } from 'toolkit/chakra/button';
import { Checkbox } from 'toolkit/chakra/checkbox';
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogRoot, DialogTitle } from 'toolkit/chakra/dialog';
import { Link } from 'toolkit/chakra/link';
import { Textarea } from 'toolkit/chakra/textarea';
import { toaster } from 'toolkit/chakra/toaster';
import { Tooltip } from 'toolkit/chakra/tooltip';

// New disclosure contract ABI (rwaNoteAuthentication — payable, takes only tokenAddress)
import rwaNoteAbi from '../../../ABI/RWA_DISCLOSURE_CONTRACT_ABI.json';
import useRWAAuth from './useRWAAuth';

const RWA_NOTE_CONTRACT_ADDRESS_FALLBACK = '0xc1C9B017F845D3BaE85f9231DD88a908a560B456';

// Derive network name from chain ID (98 = sixnet, 150 = fivenet, default sixnet)
function getNetworkName(): 'sixnet' | 'fivenet' {
  const id = Number(config.chain.id);
  if (id === 150) return 'fivenet';
  return 'sixnet';
}

interface RWANoteData {
  id: string;          // API returns "id" not "_id"
  contractAddress: string;
  contractOwnerAddress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tokenAddress: string;
  ownerAddress: string;
  isEditMode?: boolean;
  existingNote?: RWANoteData | null;
}

const CreateRWANoteModal = ({ isOpen, onClose, tokenAddress, ownerAddress, isEditMode, existingNote }: Props) => {
  const [note, setNote] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isComplianceConfirmed, setIsComplianceConfirmed] = React.useState(false);

  const queryClient = useQueryClient();
  const { getAccessToken, isAuthenticating } = useRWAAuth();

  // Hardcoded contract address — new SixRwaDisclosureContract
  const RWA_NOTE_CONTRACT_ADDRESS = config.services.rwaNoteContract.address || RWA_NOTE_CONTRACT_ADDRESS_FALLBACK;
  const network = getNetworkName();

  // Pre-populate note when modal opens in edit mode, reset when opening in create mode
  React.useEffect(() => {
    if (isOpen) {
      if (isEditMode && existingNote) {
        setNote(existingNote.note);
      } else {
        setNote('');
      }
      // Reset compliance checkbox when modal opens
      setIsComplianceConfirmed(false);
    }
  }, [isOpen, isEditMode, existingNote]);

  const { writeContractAsync } = useWriteContract();

  // Read fee amount from the new disclosure contract
  const { data: feeAmount, isLoading: isLoadingFee } = useReadContract({
    address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
    abi: rwaNoteAbi,
    functionName: 'feeAmount',
    chainId: Number(config.chain.id),
  });

  // Check authentication status on-chain (isAuthenticated, authenticatedBy, timestamp)
  const { data: contractRecord } = useReadContract({
    address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
    abi: rwaNoteAbi,
    functionName: 'getContractRecord',
    args: [tokenAddress as `0x${string}`],
    chainId: Number(config.chain.id),
  }) as { data: { isAuthenticated: boolean; authenticatedBy: string; timestamp: bigint } | undefined };

  const handleClose = React.useCallback(() => {
    setNote('');
    setTxHash(null);
    setIsSubmitting(false);
    setIsComplianceConfirmed(false);
    onClose();
  }, [onClose]);

  const handlePayFee = async () => {
    if (!note.trim()) {
      toaster.error({
        title: 'Error',
        description: 'Please enter a note',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Validate addresses
      if (!tokenAddress || !ownerAddress) {
        throw new Error('Invalid token or owner address');
      }

      // ── STEP 1: On-chain authentication (create mode only) ────────────────
      if (!isEditMode) {
        // If already authenticated on-chain, skip the payment tx (may be a retry after partial failure)
        if (contractRecord?.isAuthenticated === true) {
          toaster.info({
            title: 'Already Authenticated',
            description: 'Contract is already authenticated on-chain. Proceeding to sign in…',
          });
        } else {
          toaster.info({
            title: 'Payment Required',
            description: 'Sending native currency payment to authenticate the contract…',
          });

          // Call rwaNoteAuthentication(tokenAddress) with native value
          const hash = await writeContractAsync({
            address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
            abi: rwaNoteAbi,
            functionName: 'rwaNoteAuthentication',
            args: [ tokenAddress as `0x${string}` ],
            value: feeAmount as bigint,
          });

          setTxHash(hash);

          toaster.info({
            title: 'Transaction Submitted',
            description: 'Waiting for on-chain confirmation…',
          });

          const receipt = await waitForTransactionReceipt(wagmiConfig.config, {
            hash,
            chainId: Number(config.chain.id),
          });

          if (receipt.status === 'reverted') {
            throw new Error('Transaction reverted');
          }

          toaster.info({
            title: 'On-chain Authentication Confirmed',
            description: 'Now signing in to save your disclosure…',
          });
        }
      }

      // ── STEP 2: SIWE login & get access token ─────────────────────────────
      const accessToken = await getAccessToken(ownerAddress);

      // ── STEP 3: Call backend API with JWT ─────────────────────────────────
      const endpoint = isEditMode && existingNote
        ? `/${ network }/rwa-notes/${ existingNote.id }`
        : `/${ network }/rwa-notes`;
      const method = isEditMode ? 'PATCH' : 'POST';
      const body = isEditMode
        ? { note: note.trim() }
        : {
          contractAddress: tokenAddress,
          contractOwnerAddress: ownerAddress,
          note: note.trim(),
        };

      // Pass ?method= override so reverse proxies that rewrite PATCH→POST are bypassed
      const proxyUrl = isEditMode
        ? `/node-api/rwa-note?endpoint=${ encodeURIComponent(endpoint) }&method=PATCH`
        : `/node-api/rwa-note?endpoint=${ encodeURIComponent(endpoint) }`;

      const response = await fetch(proxyUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ accessToken }`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 201 || response.status === 200 || response.ok) {
        toaster.success({
          title: 'Success',
          description: isEditMode ? 'RWA Disclosure updated successfully!' : 'RWA Disclosure created successfully!',
        });

        // Invalidate queries to refetch the note data without reloading the page
        await queryClient.invalidateQueries({ queryKey: ['rwa-note', tokenAddress] });
        await queryClient.invalidateQueries({ queryKey: ['rwa-note-exists', tokenAddress] });

        handleClose();
      } else {
        const errorData = await response.json() as { message?: string };
        throw new Error(errorData.message || `Failed to ${isEditMode ? 'update' : 'create'} note`);
      }
    } catch (error) {
      toaster.error({
        title: 'Error',
        description: (error as Error)?.message || `Failed to ${isEditMode ? 'update' : 'create'} RWA note`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const feeAmountFormatted = feeAmount ? parseFloat((Number(BigInt(feeAmount as bigint) * BigInt(1000) / BigInt(1e18)) / 1000).toFixed(3)).toString() : '0';

  const isBusy = isSubmitting || isAuthenticating;

  const handleDialogChange = React.useCallback((details: { open: boolean }) => {
    if (!details.open && !isBusy) {
      handleClose();
    }
  }, [isBusy, handleClose]);

  const handleNoteChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
  }, []);

  const handleComplianceChange = React.useCallback((details: { checked: boolean | 'indeterminate' }) => {
    setIsComplianceConfirmed(Boolean(details.checked));
  }, []);

  const isButtonDisabled = !note.trim() || (!isEditMode && isLoadingFee) || !isComplianceConfirmed;

  let buttonLabel = '';
  if (isAuthenticating) {
    buttonLabel = 'Waiting for Signature…';
  } else if (isSubmitting) {
    buttonLabel = 'Processing Registration…';
  } else if (isEditMode) {
    buttonLabel = 'Save';
  } else {
    buttonLabel = isButtonDisabled
      ? 'Disclosure & Compliance Required'
      : 'Confirm Registration & Publish Disclosure';
  }

  const tooltipContent = isButtonDisabled
    ? 'A disclosure statement and compliance confirmation is required before submission.'
    : '';

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={handleDialogChange}
      size="md"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit' : 'Register'} RWA Disclosure Statement</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Flex direction="column" gap={4}>
            {!isEditMode && (
              <>
                <Text fontSize="md">
                  A registration fee of <Text as="span" fontWeight="bold">
                    {isLoadingFee ? 'Loading...' : `${feeAmountFormatted} SIX`}
                  </Text> is required to publish an official RWA Disclosure Statement associated with this smart contract.
                </Text>
                <Text fontSize="sm" color="gray.500">
                  You will be asked to:
                  <br />
                  1. Confirm a native SIX payment transaction on-chain
                  <br />
                  2. Sign a message with your wallet to authenticate with the API
                </Text>
              </>
            )}
            {isEditMode && (
              <Text fontSize="md">
                Update your RWA note. No payment required for edits.
              </Text>
            )}

            <Flex direction="column" gap={2}>
              <Text fontSize="sm" fontWeight="medium">
                Smart Contract Address:
              </Text>
              <Input
                value={tokenAddress}
                readOnly
                size="sm"
              />
            </Flex>

            <Flex direction="column" gap={2}>
              <Text fontSize="sm" fontWeight="medium">
                RWA Disclosure Statement:
              </Text>
              <Textarea
                placeholder={
                  'Provide a factual and structured disclosure describing the purpose, nature of'
                  + ' the underlying real-world asset, governance structure, and compliance'
                  + ' considerations.'
                }
                value={note}
                onChange={handleNoteChange}
                minH="120px"
                disabled={isBusy}
              />
            </Flex>

            <Flex direction="column" gap={2} mt={4}>
              <Checkbox
                checked={isComplianceConfirmed}
                onCheckedChange={handleComplianceChange}
                disabled={isBusy}
              >
                <Text fontSize="sm">
                  I confirm that I am an authorized representative of this project and that the
                  information provided is accurate, complete, and not misleading.
                </Text>
              </Checkbox>
            </Flex>

            {txHash && (
              <Flex direction="column" gap={2}>
                <Text fontSize="sm" fontWeight="medium">
                  Authentication Transaction:
                </Text>
                <Link
                  href={`${config.app.baseUrl}/tx/${txHash}`}
                  target="_blank"
                  color="blue.500"
                  fontSize="sm"
                  wordBreak="break-all"
                >
                  {txHash}
                </Link>
              </Flex>
            )}
          </Flex>
        </DialogBody>

        <DialogFooter>
          <Tooltip
            content={tooltipContent}
            disabled={!isButtonDisabled}
          >
            <Button
              colorScheme="blue"
              onClick={handlePayFee}
              loading={isBusy}
              disabled={isButtonDisabled}
            >
              {buttonLabel}
            </Button>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default CreateRWANoteModal;
