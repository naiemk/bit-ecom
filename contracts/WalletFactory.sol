// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Wallet.sol";

contract WalletFactory is Ownable {
    address public implementation;

    constructor() Ownable(msg.sender) {}

    event Deployed(address impl, address deped);

    function getAddress(address impl, bytes32 salt
    ) external view returns (address) {
        return Clones.predictDeterministicAddress(impl, salt);
    }

    function getAddresses(bytes32[] calldata salts
    ) external view returns (address[] memory deped) {
        deped = new address[](salts.length);
        address impl = implementation;
        for (uint i=0; i< salts.length; i++) {
            deped[i] = Clones.predictDeterministicAddress(impl, salts[i]);
        }
    }

    function deployImplementation(address payable sweepTarget) external {
        Wallet w = new Wallet{salt: 0x0000000000000000000000000000000000000000000000000000000000000011}();
        w.setSweepTarget(sweepTarget);
        w.transferOwnership(owner());
        implementation = address(w);
    }

    function updateImplementation(address newImplementation) onlyOwner external {
        implementation = newImplementation;
    }

    function singleDeploy(
        bytes32 salt
    ) external returns (address) {
        address dep = Clones.cloneDeterministic(implementation, salt);
        emit Deployed(implementation, dep);
    }

    function multiDeploy(
        bytes32[] calldata salts
    ) external {
        address impl = implementation;
        for(uint i=0; i<salts.length; i++) {
            Clones.cloneDeterministic(impl, salts[i]);
        }
    }

    function deployMinimal(address impl, bytes32 salt) external returns (address) {
        return Clones.cloneDeterministic(impl, salt);
    }

    /// TODO: Move to a new contract
    struct WalletWithBalance {
        address wallet;
        address[] tokens;
        // uint[] balances;
    }

    function filterWithBalance(address[] calldata tokens, address[] calldata wallets
    ) external view returns(WalletWithBalance[] memory walletsWithBal) {
        walletsWithBal = new WalletWithBalance[](wallets.length);
        for(uint i=0; i<wallets.length; i++) {
            address wallet = wallets[i];
            bool hasEth = wallet.balance != 0;
            uint tokWithBal = 0;
            for(uint j=0; j<tokens.length; j++) {
                if (IERC20(tokens[i]).balanceOf(wallet) != 0) {
                    tokWithBal ++;
                }
            }
            if (hasEth || tokWithBal != 0) {
                address[] memory subTokens = new address[](tokWithBal);
                uint idx = 0;
                for(uint j=0; j<tokens.length; j++) {
                    if (IERC20(tokens[i]).balanceOf(wallet) != 0) {
                        subTokens[idx] = tokens[i];
                    }
                }
                walletsWithBal[i] = WalletWithBalance({
                    wallet: wallet,
                    tokens: subTokens
                });
            } else {
                walletsWithBal[i] = WalletWithBalance({
                    wallet: address(0),
                    tokens: new address[](0)
                });
            }
        }
    }

    function sweepMulti(address[] calldata tokens, address[] calldata wallets) external payable {
        for(uint i=0; i<wallets.length; i++) {
            Wallet(payable(wallets[i])).sweepETH();
            for(uint j=0; j<tokens.length; j++) {
                Wallet(payable(wallets[i])).sweep(tokens[j]);
            }
        }
    }

    function sweep(address token, address[] calldata wallets) external {
        for(uint i=0; i<wallets.length; i++) {
            Wallet(payable(wallets[i])).sweep(token);
        }
    }

    function sweepETH(address token, address[] calldata wallets) external payable {
        for(uint i=0; i<wallets.length; i++) {
            Wallet(payable(wallets[i])).sweepETH();
        }
    }
}