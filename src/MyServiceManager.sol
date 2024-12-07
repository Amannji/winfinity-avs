pragma solidity ^0.8.13;


import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {ISignatureUtils} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtils.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

contract MyServiceManager {
    using ECDSA for bytes32;

    //state variables
    address public immutable avsDirectory;
    uint32 public latestnum;

    mapping(address => bool) public operatorsRegistered;
    mapping(uint32 => bytes32) public allTasksHashed;
    mapping(address => mapping(uint32 => bytes)) public allTasksResponses;

    //events
    event NewTaskCreated(uint32 indexed taskIndex, Task task);
    event TaskResponded(uint32 indexed taskIndex, Task index, bool taskResponse, address operator);

    struct Task{
        string contents;
        uint32 taskCreatedBlock;

    }

    //modifiers 
    modifier onlyOperator(){
        require(operatorsRegistered[msg.sender], "Only operators can call this function");
        _;
    }

    //constructor 
    constructor(address _avsDirectory){
        avsDirectory = _avsDirectory;
    }


    //Register a operator
    function registerOperator(address operator, ISignatureUtils.SignatureWithSaltAndExpiry memory operationSignature) external {
        IAVSDirectory(avsDirectory).registerOperatorToAVS(operator, operationSignature);
        operatorsRegistered[operator] = true;
    }

    //Deregister a operator
    function deregisterOperator(address operator) external onlyOperator{
        require(msg.sender == operator);
        IAVSDirectory(avsDirectory).deregisterOperatorFromAVS(operator);
        operatorsRegistered[operator] = false;
    }

    //Create Task 
    function createTask(string memory contents) external returns (Task memory){
        Task memory newTask;
        newTask.contents = contents;
        newTask.taskCreatedBlock = uint32(block.number);

        allTasksHashed[latestnum] = keccak256(abi.encode(newTask));
        emit NewTaskCreated(latestnum, newTask);
        latestnum = latestnum + 1;
        return newTask;
        }



    //Respond to task
    function respondToTask(Task memory task, uint32 taskIndex, bool taskResponse, bytes memory signature) external onlyOperator{
        require(
            keccak256(abi.encode(task)) == allTasksHashed[taskIndex], "Task does not exist");

        require(
            allTasksResponses[msg.sender][taskIndex].length == 0, "Operator has already responded to the task"
        );

        bytes32 messageHash = keccak256(abi.encodePacked(taskResponse, task.contents));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        if (ethSignedMessageHash.recover(signature) != msg.sender){
            revert("Invalid signature");
        }

        allTasksResponses[msg.sender][taskIndex] = signature;

        emit TaskResponded(taskIndex, task, taskResponse, msg.sender);

    }


}
