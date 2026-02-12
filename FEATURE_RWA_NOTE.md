# Create RWA Note Feature - Implementation Summary

## Overview
This feature adds a "Create RWA Note" button to token pages that allows token owners to create RWA (Real World Asset) notes by paying a fee.

## Files Created

### 1. `/ui/token/CreateRWANoteButton/CreateRWANoteButton.tsx`
Main component that renders the button. Only shows when:
- User wallet is connected
- User is the owner of the token contract
- Token doesn't already have an RWA note

### 2. `/ui/token/CreateRWANoteButton/CreateRWANoteModal.tsx`
Modal dialog component that:
- Shows fee amount (fetched from smart contract)
- Accepts user input for the note text
- Calls `payFeeForToken` function on the smart contract
- After successful payment, calls backend API to create the note
- Shows transaction hash with link

### 3. `/ui/token/CreateRWANoteButton/useCheckRWANoteEligibility.ts`
Custom React hook that checks:
- If the connected wallet is the token owner
- If the token already has an RWA note (via API call)

### 4. `/ui/token/CreateRWANoteButton/index.ts`
Index file for easier imports

## Integration

The button has been added to `/ui/token/TokenPageTitle.tsx` on line 121, right after the `AccountActionsMenu` component:

```tsx
{!isLoading && tokenQuery.data && <CreateRWANoteButton token={tokenQuery.data} isLoading={isLoading} />}
```

## Technical Details

### Smart Contract Integration
- Contract Address: `0x01824B8F5cC22Cab69B611C2b9Dee53494C368c6`
- ABI File: `/ABI/rwa-create-note-abi.json`
- Functions Used:
  - `feeAmount()` - Get the fee amount required
  - `payFeeForToken(address tokenAddress, uint8 tokenType)` - Pay fee and authorize token

### API Integration
- Base URL: `https://rwa-note-backend-fivenet-593361572149.asia-southeast1.run.app`
- Endpoints:
  - `GET /rwa-notes/by-contract/{tokenAddress}` - Check if note exists
  - `POST /rwa-notes` - Create new note

### Flow
1. User connects wallet
2. System checks if user is token owner
3. System checks if token already has a note
4. If eligible, button appears
5. User clicks button → modal opens
6. User enters note text
7. User clicks "Pay Fee & Create Note"
8. MetaMask prompts user to pay fee
9. After transaction confirms, API call creates the note
10. Page refreshes to show updated state

## Dependencies
- wagmi (for web3 interactions)
- @tanstack/react-query (for data fetching)
- @chakra-ui/react (for UI components)

## Environment
- Works with the project's existing wagmi configuration
- Uses the app's API endpoint configuration from `configs/app`

## Testing
To test this feature:
1. Connect a wallet that owns a token contract
2. Navigate to that token's page
3. You should see the "Create RWA Note" button
4. Click it and follow the flow
5. After successful creation, the button should disappear (token now has a note)

## Notes
- The button only appears when all conditions are met (connected wallet, is owner, no existing note)
- Currently defaults to TokenType.ERC20 (0) when calling the contract
- Page auto-refreshes after successful note creation to update UI
