pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Refunder {
    function refundBack() external payable {
        payable(msg.sender).transfer(msg.value);
    }
    function forwardTo(address recipient) external payable {
        payable(recipient).transfer(msg.value);
    }
}

contract InvokerWithSimpleReceive is Initializable {
    address allowedRefunder;

    function initialize(address allowedRefunder_) public initializer {
        allowedRefunder = allowedRefunder_;
    }

    function invoke(
        bytes calldata data
    ) external payable {
        (bool success, ) = allowedRefunder.call{value: msg.value}(data);
        require(success, 'invoker.invoke(): call failed');
    }

    receive() external payable virtual {
    }
}

contract InvokerWithProtectedReceive is InvokerWithSimpleReceive {
    receive() external payable override {
        assert(msg.sender != allowedRefunder);
    }
}
