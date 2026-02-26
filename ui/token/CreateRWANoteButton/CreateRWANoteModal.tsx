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

import rwaNoteAbi from '../../../ABI/rwa-create-note-abi.json';

const RWA_NOTE_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS || '0x2A0f976Ad09e8389Aaf687709f81369fb93E4f9a';

// TokenType enum from smart contract: 0 = UNKNOWN, 1 = ERC20, 2 = ERC721
// Must be passed as numbers to the contract
const TOKEN_TYPE = {
  UNKNOWN: 0,
  ERC20: 1,
  ERC721: 2,
} as const;

// ERC20 ABI for approve function
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface TokenInfoData {
  hasPaid: boolean;
  tokenType: number;
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
  const [approvalTxHash, setApprovalTxHash] = React.useState<string | null>(null);
  const [isComplianceConfirmed, setIsComplianceConfirmed] = React.useState(false);

  const queryClient = useQueryClient();

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

  // Read fee amount from contract
  const { data: feeAmount, isLoading: isLoadingFee } = useReadContract({
    address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
    abi: rwaNoteAbi,
    functionName: 'feeAmount',
  });

  // Read SIX token address from contract
  const { data: sixTokenAddress } = useReadContract({
    address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
    abi: rwaNoteAbi,
    functionName: 'sixToken',
  });

  // Check if token has already paid (for additional validation)
  const { data: tokenInfo } = useReadContract({
    address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
    abi: rwaNoteAbi,
    functionName: 'tokenInfo',
    args: [tokenAddress as `0x${string}`],
  }) as { data: TokenInfoData | undefined };

  const handleClose = React.useCallback(() => {
    setNote('');
    setTxHash(null);
    setApprovalTxHash(null);
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

      // Skip payment flow if editing existing note
      if (!isEditMode) {
        // Check if already paid
        if (tokenInfo?.hasPaid === true) {
          throw new Error('This token has already paid the RWA Note fee');
        }

        // Check if sixTokenAddress is the zero address (0x0000...)
        const isZeroAddress = !sixTokenAddress || sixTokenAddress === '0x0000000000000000000000000000000000000000';

        if (isZeroAddress) {
          // Contract uses native currency (not ERC20 tokens)
          toaster.info({
            title: 'Payment Required',
            description: 'Sending native currency payment...',
          });

          // Call payFeeForToken with value (native currency)
          // TokenType: 1 = ERC20, 2 = ERC721
          const hash = await writeContractAsync({
            address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
            abi: rwaNoteAbi,
            functionName: 'payFeeForToken',
            args: [
              tokenAddress as `0x${string}`,
              TOKEN_TYPE.ERC20, // Pass as number: 1
            ],
            value: feeAmount as bigint, // Pay with native currency
          });

          setTxHash(hash);

          // Wait for transaction confirmation
          const receipt = await waitForTransactionReceipt(wagmiConfig.config, {
            hash,
            chainId: Number(config.chain.id),
          });

          if (receipt.status === 'reverted') {
            throw new Error('Transaction reverted');
          }
        } else {
          // Contract uses ERC20 SIX tokens - need approval first
          toaster.info({
            title: 'Approval Required',
            description: 'Please approve the contract to spend your SIX tokens...',
          });

          const approvalHash = await writeContractAsync({
            address: sixTokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`, feeAmount as bigint],
          });

          setApprovalTxHash(approvalHash);

          // Wait for approval confirmation
          const approvalReceipt = await waitForTransactionReceipt(wagmiConfig.config, {
            hash: approvalHash,
            chainId: Number(config.chain.id),
          });

          if (approvalReceipt.status === 'reverted') {
            throw new Error('Approval transaction reverted');
          }

          toaster.info({
            title: 'Approval Confirmed',
            description: 'Now paying the fee...',
          });

          // Call payFeeForToken function (NO value needed, contract will transferFrom)
          // TokenType: 1 = ERC20, 2 = ERC721
          const hash = await writeContractAsync({
            address: RWA_NOTE_CONTRACT_ADDRESS as `0x${string}`,
            abi: rwaNoteAbi,
            functionName: 'payFeeForToken',
            args: [
              tokenAddress as `0x${string}`,
              TOKEN_TYPE.ERC20, // Pass as number: 1
            ],
            // NO value field - the contract will pull SIX tokens via transferFrom
          });

          setTxHash(hash);

          // Wait for transaction confirmation
          const receipt = await waitForTransactionReceipt(wagmiConfig.config, {
            hash,
            chainId: Number(config.chain.id),
          });

          if (receipt.status === 'reverted') {
            throw new Error('Transaction reverted');
          }
        }
      } // End of payment flow for create mode

      // Call backend API to create or update note via Next.js proxy

      const endpoint = isEditMode && existingNote ?
        `/rwa-notes/${existingNote._id}` :
        '/rwa-notes';
      const method = isEditMode ? 'PATCH' : 'POST';
      const body = isEditMode ?
        { note: note.trim() } :
        {
          contractAddress: tokenAddress,
          contractOwnerAddress: ownerAddress,
          note: note.trim(),
        };

      const response = await fetch(`/node-api/rwa-note?endpoint=${encodeURIComponent(endpoint)}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
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

  const feeAmountInSix = feeAmount ? Number(feeAmount) / 1e18 : 0;
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const isZeroAddress = !sixTokenAddress || sixTokenAddress === zeroAddress;

  const handleDialogChange = React.useCallback((details: { open: boolean }) => {
    if (!details.open && !isSubmitting) {
      handleClose();
    }
  }, [isSubmitting, handleClose]);

  const handleNoteChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
  }, []);

  const handleComplianceChange = React.useCallback((details: { checked: boolean | 'indeterminate' }) => {
    setIsComplianceConfirmed(Boolean(details.checked));
  }, []);

  const isButtonDisabled = !note.trim() || (!isEditMode && isLoadingFee) || (isEditMode && !isComplianceConfirmed) || (!isEditMode && !isComplianceConfirmed);

  let buttonLabel = '';
  if (isSubmitting) {
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
                    {isLoadingFee ? 'Loading...' : `${feeAmountInSix} SIX`}
                  </Text> is required to publish an official RWA Disclosure Statement associated with this smart contract.
                </Text>

                {!isZeroAddress && (
                  <Text fontSize="sm" color="gray.500">
                    Note: You will need to approve two transactions:
                    <br />
                    1. Approve the contract to spend your SIX tokens
                    <br />
                    2. Pay the fee to create the note
                  </Text>
                )}
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
                disabled={isSubmitting}
              />
            </Flex>

            <Flex direction="column" gap={2} mt={4} >
              <Checkbox
                checked={isComplianceConfirmed}
                onCheckedChange={handleComplianceChange}
                disabled={isSubmitting}
              >
                <Text fontSize="sm">
                  I confirm that I am an authorized representative of this project and that the
                  information provided is accurate, complete, and not misleading.
                </Text>
              </Checkbox>
            </Flex>

            {approvalTxHash && (
              <Flex direction="column" gap={2}>
                <Text fontSize="sm" fontWeight="medium">
                  Approval Transaction:
                </Text>
                <Link
                  href={`${config.app.baseUrl}/tx/${approvalTxHash}`}
                  target="_blank"
                  color="blue.500"
                  fontSize="sm"
                  wordBreak="break-all"
                >
                  {approvalTxHash}
                </Link>
              </Flex>
            )}

            {txHash && (
              <Flex direction="column" gap={2}>
                <Text fontSize="sm" fontWeight="medium">
                  Payment Transaction Reference:
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
              loading={isSubmitting}
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
