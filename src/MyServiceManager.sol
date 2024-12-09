pragma solidity ^0.8.13;


import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {ISignatureUtils} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtils.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

contract MyServiceManager {
    using ECDSA for bytes32;

    // State variables
    address public immutable avsDirectory;
    uint32 public latestnum;

    mapping(address => bool) public operatorsRegistered;
    mapping(uint32 => bytes32) public allTasksHashed;
    mapping(address => mapping(uint32 => bytes)) public allTasksResponses;

    // Events
    event NewTaskCreated(uint32 indexed taskIndex, Task task);
    event TaskResponded(uint32 indexed taskIndex, Task task, string textResponse, uint32 gameIdResponse, uint32 targetScoreResponse, address operator);

    struct Task {
        string contents;
        uint32 taskCreatedBlock;
        uint32 scoreDifference;
    }

    // Modifiers
    modifier onlyOperator() {
        require(operatorsRegistered[msg.sender], "Only operators can call this function");
        _;
    }

    // Constructor
    constructor(address _avsDirectory) {
        require(_avsDirectory != address(0), "Invalid AVS directory address");
        avsDirectory = _avsDirectory;
    }

    // Register an operator
    function registerOperator(address operator, ISignatureUtils.SignatureWithSaltAndExpiry memory operatorSignature) external {
        require(operator != address(0), "Invalid operator address");
        require(!operatorsRegistered[operator], "Operator already registered");
        
        IAVSDirectory(avsDirectory).registerOperatorToAVS(operator, operatorSignature);
        operatorsRegistered[operator] = true;
    }

    // Deregister an operator
    function deregisterOperator(address operator) external onlyOperator {
        require(msg.sender == operator, "Only operator can deregister themselves");
        require(operatorsRegistered[operator], "Operator not registered");
        
        IAVSDirectory(avsDirectory).deregisterOperatorFromAVS(operator);
        operatorsRegistered[operator] = false;
    }

    // Create Task
    function createTask(string memory contents, uint32 scoreDifference) external returns (Task memory) {
        require(bytes(contents).length > 0, "Task contents cannot be empty");
        
        Task memory newTask = Task({
            contents: contents,
            scoreDifference: scoreDifference,
            taskCreatedBlock: uint32(block.number)
        });

        allTasksHashed[latestnum] = keccak256(abi.encode(newTask));
        emit NewTaskCreated(latestnum, newTask);
        latestnum++;
        return newTask;
    }

    // Respond to task
    function respondToTask(
        Task memory task,
        uint32 taskIndex,
        string memory textResponse,
        uint32 gameIdResponse,
        uint32 targetScoreResponse,
        bytes memory signature
    ) external onlyOperator {
        require(keccak256(abi.encode(task)) == allTasksHashed[taskIndex], "Task does not exist");
        require(allTasksResponses[msg.sender][taskIndex].length == 0, "Operator has already responded to the task");
        require(bytes(textResponse).length > 0, "Text response cannot be empty");

        bytes32 messageHash = keccak256(abi.encodePacked(textResponse, gameIdResponse, targetScoreResponse, task.contents));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        require(ethSignedMessageHash.recover(signature) == msg.sender, "Invalid signature");

        allTasksResponses[msg.sender][taskIndex] = signature;
        emit TaskResponded(taskIndex, task, textResponse, gameIdResponse, targetScoreResponse, msg.sender);
    }

}
