pragma solidity ^0.8.13;

import {MyServiceManager} from "../src/MyServiceManager.sol";
import {Script} from "forge-std/Script.sol";
import {IDelegationManager} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {AVSDirectory} from "eigenlayer-contracts/src/contracts/core/AVSDirectory.sol";
import {ISignatureUtils} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtils.sol";


contract DeployMyServiceManager is Script{
    address internal constant AVS_DIRECTORY = 0x135DDa560e946695d6f155dACaFC6f1F25C1F5AF;
    address internal constant DELEGATION_MANAGER = 0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A;


    address internal deployer;
    address internal operator;

    MyServiceManager serviceManager;

    function setUp() public virtual{
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        operator = vm.rememberKey(vm.envUint("OPERATOR_PRIVATE_KEY"));
        vm.label(deployer,"Deployer");
        vm.label(operator, "Operator");
    }

    function run() public{

        //deploy 
        vm.startBroadcast();
        serviceManager = new MyServiceManager(AVS_DIRECTORY);
        vm.stopBroadcast();

        IDelegationManager delegationManager = IDelegationManager(DELEGATION_MANAGER);
        
        IDelegationManager.OperatorDetails memory operatorDetails = IDelegationManager.OperatorDetails({
            earningsReceiver: operator,
            delegationApprover: address(0),
            stakerOptOutWindowBlocks:0
        });
        vm.startBroadcast(operator);
        delegationManager.registerAsOperator(operatorDetails, "");
        vm.stopBroadcast();

        //Register operator to AVS

        AVSDirectory avsDirectory = AVSDirectory(AVS_DIRECTORY);
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, operator));
        uint256 expiry = block.timestamp + 1 hours;

        bytes32 operatorRegistrationDigestHash = avsDirectory.calculateOperatorAVSRegistrationDigestHash(
            operator,
            address(serviceManager),
            salt,
            expiry
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vm.envUint("OPERATOR_PRIVATE_KEY"), operatorRegistrationDigestHash);
        bytes memory signature = abi.encodePacked(r,s,v);

        ISignatureUtils.SignatureWithSaltAndExpiry memory operatorSignature = ISignatureUtils.SignatureWithSaltAndExpiry({
            signature: signature,
            salt: salt,
            expiry: expiry
        });

        vm.startBroadcast(operator);
        serviceManager.registerOperator(operator,operatorSignature);
        vm.stopBroadcast();
    }

    
}