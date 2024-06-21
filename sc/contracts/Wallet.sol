// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IWithInit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWallet {
    function sweepTarget() external view returns (address payable);
    function sweep(address token) external;
    function sweepETH() external payable;
}

contract Wallet is IWallet {
    address payable immutable public override sweepTarget;
    using SafeERC20 for IERC20;

    constructor() {
        sweepTarget = IWithInit(msg.sender).initAddr();
    }

    receive() external payable {}

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