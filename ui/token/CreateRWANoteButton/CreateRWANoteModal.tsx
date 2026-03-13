import {
  Box,
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

const RWA_NOTE_CONTRACT_ADDRESS_FALLBACK = '0x7767d7bc3bA67Dc50593572296B948474B9aF2c0';

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

const DISCLOSURE_EXAMPLES = [
  {
    title: 'Real Estate Token',
    text:
      'This token represents a fractional ownership interest in a residential property located in Bangkok, Thailand. '
      + 'The asset is managed by XYZ Property Co., Ltd. under a leasehold agreement. '
      + 'Distributions are paid quarterly in SIX tokens. '
      + 'Governance and compliance are handled by the issuer in accordance with Thai SEC regulations. '
      + 'For more information visit <Link href="https://example.com/reit-docs">Official Documentation</Link>.',
  },
  {
    title: 'Bond / Fixed-Income Token',
    text:
      'This token represents a corporate bond issued by ABC Finance Ltd. with a face value of 1,000 USD '
      + 'and a 6% annual coupon rate, maturing on 31 December 2027. '
      + 'Principal and interest repayments are made on-chain to token holders. '
      + 'The bond is governed under the laws of Singapore. '
      + 'Prospectus: <Link href="https://example.com/bond-prospectus">Download PDF</Link>.',
  },
  {
    title: 'Commodity / Gold-Backed Token',
    text:
      'Each token is backed by 1 troy ounce of LBMA-certified gold held in a bonded vault in Singapore, '
      + 'audited quarterly by IndependentAudit Pte. Ltd. '
      + 'Redemption requests are processed within 5 business days. '
      + 'Custody agreement: <Link href="https://example.com/custody">View Agreement</Link>.',
  },
];

const DisclosureHelpModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const handleOpenChange = React.useCallback((d: { open: boolean }) => { if (!d.open) onClose(); }, [ onClose ]);
  return (
    <DialogRoot open={isOpen} onOpenChange={handleOpenChange} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to Write an RWA Disclosure Statement</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Flex direction="column" gap={5}>
            <Text fontSize="sm" color="gray.600">
              An RWA (Real-World Asset) Disclosure Statement is a short, factual description of the
              real-world asset that this smart contract represents. It should be easy for investors
              and regulators to read and verify. Good disclosures include:
            </Text>
            <Flex direction="column" gap={1} pl={4}>
              { [
                'The type of real-world asset (property, bond, commodity, etc.)',
                'The issuer or manager and their jurisdiction',
                'Key financial terms (value, yield, maturity) if applicable',
                'How distributions or redemptions work',
                'A link to official documentation using the Link tag shown below',
              ].map((item) => (
                <Text key={item} fontSize="sm" color="gray.700">
                  {'• '}{item}
                </Text>
              )) }
            </Flex>

            <Text fontSize="sm" fontWeight="semibold" color="gray.700" mt={2}>
              Linking to External URLs
            </Text>
            <Box
              bg="gray.50"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="md"
              p={3}
              fontSize="sm"
              fontFamily="mono"
              color="blue.700"
              wordBreak="break-all"
            >
              {'<Link href="https://your-website.com/docs">Click here</Link>'}
            </Box>
            <Text fontSize="xs" color="gray.500">
              Only https:// and http:// URLs are accepted.
              The link will open in a new tab on the token page.
            </Text>

            <Text fontSize="sm" fontWeight="semibold" color="gray.700" mt={2}>
              Examples
            </Text>
            { DISCLOSURE_EXAMPLES.map((ex) => (
              <Box
                key={ex.title}
                bg="blue.50"
                border="1px solid"
                borderColor="blue.100"
                borderRadius="md"
                p={3}
              >
                <Text fontSize="xs" fontWeight="bold" color="blue.700" mb={1}>
                  {ex.title}
                </Text>
                <Text fontSize="sm" color="gray.700" whiteSpace="pre-wrap">
                  {ex.text}
                </Text>
              </Box>
            )) }
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

const CreateRWANoteModal = ({ isOpen, onClose, tokenAddress, ownerAddress, isEditMode, existingNote }: Props) => {
  const [note, setNote] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
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
    <>
    <DisclosureHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
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
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" fontWeight="medium">
                  RWA Disclosure Statement:
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="blue"
                  onClick={() => setIsHelpOpen(true)}
                  disabled={isBusy}
                >
                  📄 Disclosure Documentation
                </Button>
              </Flex>
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



            <Flex align="flex-start" gap={2} mt={4}>
              <Checkbox
                checked={isComplianceConfirmed}
                onCheckedChange={handleComplianceChange}
                disabled={isBusy}
                mt="2px"
              />
              <Text fontSize="sm" lineHeight="1.5" cursor="pointer" onClick={() => !isBusy && setIsComplianceConfirmed((v) => !v)}>
                I confirm that I am an authorized representative of this project and that the
                information provided is accurate, complete, and not misleading.
              </Text>
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
    </>
  );
};

export default CreateRWANoteModal;
