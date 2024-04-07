// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWallet {
    function sweep(address token) external;
    function sweepETH() external payable;
}

contract Wallet is IWallet, Ownable {
    address payable public sweepTarget;
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

    receive() external payable {}

    function setSweepTarget(address payable target) external onlyOwner {
        sweepTarget = target;
    }

    function sweep(address token) external override {
        uint balance = IERC20(token).balanceOf(address(this));
        if (balance != 0) {
            IERC20(token).safeTransfer(sweepTarget, balance);
        }
    }

    function sweepETH() external payable override {
        uint _balance = address(this).balance;
        if (_balance != 0) {
            sweepTarget.transfer(_balance);
        }
    }
}