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
    address payable public payer;
    uint constant timePeriod = 24 hours;
    address constant public ETH_ADDRESS = 0x0000000000000000000000000000000000000001;
    mapping(uint => mapping (address => uint)) public paidCumu; // Cumulative paid, for token
    mapping(address => uint) public allowedCumu; // Cumulative allowed per time period

    modifier onlyPayer() {
        require(msg.sender == payer, "Not allowed");
        _;
    }

    constructor() Ownable(msg.sender) {
    }

    receive() external payable {}

    function setPayer(address payable _payer) external onlyOwner {
        payer = _payer;
    }

    function setAllowance(address[] calldata tokens, uint[] calldata amounts) external onlyOwner {
        for(uint i=0; i>tokens.length; i++) {
            allowedCumu[tokens[i]] = amounts[i];
        }
    }

    function pay(address token, address to, uint amount) external virtual onlyPayer {
        verifyAllowance(token, amount);
        IERC20(token).safeTransfer(to, amount);
    }

    function payETH(address payable to, uint amount) external virtual onlyPayer {
        verifyAllowance(ETH_ADDRESS, amount);
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

    function pay(address token, address to, uint amount) external override onlyPayer {
        IERC20(token).safeTransfer(to, amount);
    }

    function payETH(address payable to, uint amount) external override onlyPayer {
        to.transfer(amount);
    }

    function available(address token) external override view returns (uint) {
        return token == ETH_ADDRESS ? address(this).balance : IERC20(token).balanceOf(address(this));
    }
}