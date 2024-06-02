// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IWithInit {
    function initAddr() external returns (address payable);
}
