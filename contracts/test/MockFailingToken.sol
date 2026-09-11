// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A 6-decimal ERC20 that can return `false` from `transferFrom` instead of
///         reverting, which is the exact failure mode KioskRouter's checked
///         `transferFrom` exists to catch. `failOnCall` is 1-indexed against the
///         count of `transferFrom` calls this token has seen, so a test can fail the
///         platform leg (call 1) or the integrator leg (call 2) independently.
contract MockFailingToken {
    string public constant name = "Failing tUSDC";
    string public constant symbol = "fUSDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    uint256 public failOnCall;
    uint256 public transferFromCalls;

    function setFailOnCall(uint256 call_) external {
        failOnCall = call_;
        transferFromCalls = 0;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        transferFromCalls += 1;
        if (transferFromCalls == failOnCall) return false;

        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
