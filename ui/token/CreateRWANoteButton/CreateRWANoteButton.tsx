import React from 'react';

import type { TokenInfo } from 'types/api/token';

import { Button } from 'toolkit/chakra/button';

import useAccount from 'lib/web3/useAccount';

import CreateRWANoteModal from './CreateRWANoteModal';
import useCheckRWANoteEligibility from './useCheckRWANoteEligibility';

interface TokenWithAddress extends TokenInfo {
  address?: string;
}

interface Props {
    token: TokenWithAddress;
    isLoading?: boolean;
}

const CreateRWANoteButton = ({ token, isLoading }: Props) => {
    const { address: walletAddress } = useAccount();
    const [isModalOpen, setIsModalOpen] = React.useState(false);

    // Handle both address_hash and address properties (API inconsistency)
    const tokenAddress = token.address || token.address_hash;

    const { noteData, hasNote } = useCheckRWANoteEligibility(tokenAddress, walletAddress);

    const handleOpenModal = React.useCallback(() => setIsModalOpen(true), []);
    const handleCloseModal = React.useCallback(() => setIsModalOpen(false), []);

    // Show button if:
    // 1. User is connected (has wallet)
    // 2. No existing note from backend
    // Edit mode is disabled - only "Register RWA Disclosure" is available
    const shouldShowButton = Boolean(walletAddress) && !hasNote;

    const buttonText = 'Register RWA Disclosure';
    const isEditMode = false;

    if (!shouldShowButton) {
        return null;
    }

    return (
        <>
            <Button
                size="sm"
                variant="outline"
                onClick={ handleOpenModal }
                loading={ isLoading }
            >
                {buttonText}
            </Button>

            <CreateRWANoteModal
                isOpen={isModalOpen}
                onClose={ handleCloseModal }
                tokenAddress={tokenAddress}
                ownerAddress={walletAddress || ''}
                isEditMode={isEditMode}
                existingNote={noteData}
            />
        </>
    );
};

export default CreateRWANoteButton;
