// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IDepositContract {
    function deposit(
        bytes calldata pubkey,
        bytes calldata withdrawal_credentials,
        bytes calldata signature,
        bytes32 deposit_data_root
    ) external payable;
}

contract CustodialMasterVault is Ownable, Pausable {

    // --- State Variables ---
    IDepositContract public immutable BEACON_DEPOSIT_CONTRACT;
    
    // --- Events ---
    // Emitted whenever ANY funds hit this contract
    event FundsReceived(address indexed sender, uint256 amount, uint256 timestamp);
    event StakedToValidator(bytes pubkey, uint256 amount);
    event PayoutProcessed(address indexed user, uint256 amount);

    constructor(address _beaconDepositContract) Ownable(msg.sender) {
        BEACON_DEPOSIT_CONTRACT = IDepositContract(_beaconDepositContract);
    }

    // =============================================================
    // 1. INBOUND: ACCEPT FUNDS (USER DEPOSITS & REWARDS)
    // =============================================================

    /**
     * @notice This function triggers automatically when anyone sends ETH 
     * to this contract address.
     * @dev Backend monitors 'FundsReceived'. 
     * IF sender == Known User (QSafe) -> Credit User Balance.
     * IF sender == Validator -> Credit Reward Pool.
     */
    receive() external payable whenNotPaused {
        emit FundsReceived(msg.sender, msg.value, block.timestamp);
    }

    // =============================================================
    // 2. OUTBOUND: STAKE (ADMIN ONLY)
    // =============================================================

    /**
     * @notice Batch deposits 32 ETH chunks to the Beacon Chain.
     * @dev Security: FORCES withdrawal credentials to point back to THIS contract.
     */
    function batchStakeToBeacon(
        bytes[] calldata pubkeys,
        bytes[] calldata signatures,
        bytes32[] calldata deposit_data_roots
    ) external onlyOwner {
        uint256 count = pubkeys.length;
        require(address(this).balance >= count * 32 ether, "Insufficient ETH");

        // The Magic Security Line: 
        // 0x01 = Type 1 (Eth1 Address)
        // 0x00... = Padding
        // address(this) = Forces rewards to come back HERE.
        bytes memory correctCredentials = abi.encodePacked(
            bytes1(0x01),
            bytes11(0x00),
            address(this)
        );

        for (uint256 i = 0; i < count; i++) {
            BEACON_DEPOSIT_CONTRACT.deposit{value: 32 ether}(
                pubkeys[i],
                correctCredentials, 
                signatures[i],
                deposit_data_roots[i]
            );
            emit StakedToValidator(pubkeys[i], 32 ether);
        }
    }

    // =============================================================
    // 3. OUTBOUND: WITHDRAW (ADMIN ONLY)
    // =============================================================

    /**
     * @notice Send ETH to a user (for withdrawals or early exit).
     */
    function payoutUser(address payable _user, uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount, "Insufficient Liquid ETH");
        
        (bool success, ) = _user.call{value: _amount}("");
        require(success, "Transfer failed");
        
        emit PayoutProcessed(_user, _amount);
    }
}