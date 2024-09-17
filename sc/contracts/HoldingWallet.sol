// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A holding wallet with payer and owner. Payer has limitted allowance per time period.
 * This is useful for payment wallets, where server does the paying.
 * If server got hacked, and private key of payer got leaked, the damage remains minmal.
 */
contract HoldingWallet is Ownable {
    using SafeERC20 for IERC20;

    string constant public VERSION = "0.0.1";
    mapping(address => bool) public payers;
    uint constant timePeriod = 24 hours;
    address constant public ETH_ADDRESS = 0x0000000000000000000000000000000000000001;
    mapping(uint => mapping (address => uint)) public paidCumu; // Cumulative paid, for token
    mapping(address => uint) public allowedCumu; // Cumulative allowed per time period
    mapping(bytes32 => bool) public payments;

    modifier onlyPayer() {
        require(payers[msg.sender], "Not allowed");
        _;
    }

    constructor() Ownable(msg.sender) {
    }

    receive() external payable {}

    function addPayer(address payer) external onlyOwner {
        payers[payer] = true;
    }

    function removePayer(address payer) external onlyOwner {
        delete payers[payer];
    }

    function setAllowance(address[] calldata tokens, uint[] calldata amounts) external onlyOwner {
        for(uint i=0; i>tokens.length; i++) {
            allowedCumu[tokens[i]] = amounts[i];
        }
    }

    function sweep(address token, address sweepTarget) external onlyOwner {
        uint balance = IERC20(token).balanceOf(address(this));
        if (balance != 0) {
            IERC20(token).safeTransfer(sweepTarget, balance);
        }
    }

    function sweepETH(address payable sweepTarget) external onlyOwner {
        uint _balance = address(this).balance;
        if (_balance != 0) {
            sweepTarget.transfer(_balance);
        }
    }

    function pay(address token, address to, uint amount, bytes32 payId) external virtual onlyPayer {
        require(!payments[payId], "already paid");
        verifyAllowance(token, amount);
        payments[payId] = true;
        IERC20(token).safeTransfer(to, amount);
    }

    function payETH(address payable to, uint amount, bytes32 payId) external virtual onlyPayer {
        require(!payments[payId], "already paid");
        verifyAllowance(ETH_ADDRESS, amount);
        payments[payId] = true;
        to.transfer(amount);
    }

    /**
     * @notice Calculate available amount. Which is max of liq and allowance.
     * Allowance is calculated based on totalAllowedPer24. 
     */
    function available(address token) external virtual view returns (uint) {
        (uint allowed,,) = allowedByCumu(token);
        uint balance = token == ETH_ADDRESS ? address(this).balance : IERC20(token).balanceOf(address(this));
        return allowed > balance ? balance : allowed;
    }

    function verifyAllowance(address token, uint amount) internal {
        (uint allowed, uint paid, uint key) = allowedByCumu(token);
        require(amount <= allowed, "Total exceeds allowed");
        paidCumu[key][token] = paid + amount;
        // TODO: Check if we save money by deleting the last item
        if (paidCumu[key-1][token] != 0) {
            delete paidCumu[key-1][token];
        }
    }

    function allowedByCumu(address token) internal view returns (uint allowed, uint paid, uint key) {
        uint h;
        (key, h) = bucket(block.timestamp);
        allowed = (allowedCumu[token] * (h+1) / 24); // This is allowed extrapolated hourly
        paid = paidCumu[key][token];
        allowed = allowed > paid ? allowed - paid : 0;
    }

    function bucket(uint time) private pure returns (uint, uint) {
        uint key = time / 24 hours;
        uint h = (time - key) / 1 hours;
        return (key, h);
    }
}

/**
 * @notice HoldingWallet, but without checks for cumulative payment. So that transactions are cheaper,
 *  albeight less secure
 */
contract HoldingWalletSimple is HoldingWallet {
    using SafeERC20 for IERC20;
    constructor() {
    }

    function pay(address token, address to, uint amount, bytes32 payId) external override onlyPayer {
        require(!payments[payId], "already paid");
        IERC20(token).safeTransfer(to, amount);
        payments[payId] = true;
    }

    function payETH(address payable to, uint amount, bytes32 payId) external override onlyPayer {
        require(!payments[payId], "already paid");
        to.transfer(amount);
        payments[payId] = true;
    }

    function available(address token) external override view returns (uint) {
        return token == ETH_ADDRESS ? address(this).balance : IERC20(token).balanceOf(address(this));
    }
}