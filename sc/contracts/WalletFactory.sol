// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IWithInit.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Wallet.sol";

contract WalletFactory is Ownable, IWithInit {
    string constant public VERSION = "0.0.1";
    address public implementation;
    address payable public initAddr;

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
        require(impl != address(0), "No implementation");
        for (uint i=0; i< salts.length; i++) {
            deped[i] = Clones.predictDeterministicAddress(impl, salts[i]);
        }
    }

    function deployImplementation(address payable sweepTarget) external onlyOwner {
        initAddr = sweepTarget;
        Wallet w = new Wallet{salt: 0x0000000000000000000000000000000000000000000000000000000000000011}();
        implementation = address(w);
        delete initAddr;
    }

    function updateImplementation(address newImplementation) onlyOwner external {
        implementation = newImplementation;
    }

    function singleDeploy(
        bytes32 salt
    ) external {
        address dep = Clones.cloneDeterministic(implementation, salt);
        emit Deployed(implementation, dep);
    }

    function multiDeploy(
        bytes32[] calldata salts
    ) external {
        address impl = implementation;
        if (impl == address(0)) {
            revert("No implementation");
        }
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
        uint[] balances;
    }

    function filterWithBalance(address[] calldata tokens, address[] calldata wallets
    ) external view returns(WalletWithBalance[] memory walletsWithBal) {
        walletsWithBal = new WalletWithBalance[](wallets.length);
        for(uint i=0; i<wallets.length; i++) {
            address wallet = wallets[i];
            walletsWithBal[i] = walletWithBalance(tokens, wallet);
        }
    }

    function walletWithBalance(address[] calldata tokens, address wallet
    ) private view returns (WalletWithBalance memory walletsWithBal) {
        bool hasEth = wallet.balance != 0;
        uint tokWithBal = 0;
        for(uint j=0; j<tokens.length; j++) {
            if (IERC20(tokens[j]).balanceOf(wallet) != 0) {
                tokWithBal ++;
            }
        }
        if (hasEth) {
            tokWithBal ++;
        }
        if (tokWithBal != 0) {
            address[] memory subTokens = new address[](tokWithBal);
            uint[] memory amounts = new uint[](tokWithBal);
            uint idx = 0;
            for(uint j=0; j<tokens.length; j++) {
                uint bal = IERC20(tokens[j]).balanceOf(wallet);
                if (bal != 0) {
                    subTokens[idx] = tokens[j];
                    amounts[idx] = bal;
                    idx ++;
                }
            }
            if (hasEth) {
                subTokens[idx] = address(0);
                amounts[idx] = wallet.balance;
            }
            walletsWithBal = WalletWithBalance({
                wallet: wallet,
                tokens: subTokens,
                balances: amounts
            });
        } else {
            walletsWithBal = WalletWithBalance({
                wallet: address(0),
                tokens: new address[](0),
                balances: new uint[](0)
            });
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

    function sweepETH(address[] calldata wallets) external payable {
        for(uint i=0; i<wallets.length; i++) {
            Wallet(payable(wallets[i])).sweepETH();
        }
    }

    function needsDeploy(address[] calldata wallets) external view returns (bool[] memory res) {
        res = new bool[](wallets.length);
        for(uint i=0; i<wallets.length; i++) {
            (bool succeed, ) = wallets[i].staticcall(abi.encodeWithSelector(IWallet.sweepTarget.selector, wallets[i]));
            res[i] = succeed;
        }
    }
}