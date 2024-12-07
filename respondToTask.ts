import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodePacked,
  keccak256,
  parseAbiItem,
  AbiEvent,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import ollama from "ollama";
import "dotenv/config";

if (!process.env.OPERATOR_PRIVATE_KEY) {
  throw new Error("OPERATOR_PRIVATE_KEY not found in environment variables");
}

type Task = {
  contents: string;
  taskCreatedBlock: number;
  scoreDifference: number;
};

const abi = parseAbi([
  "function respondToTask((string contents, uint32 taskCreatedBlock, uint32 scoreDifference) task, uint32 referenceTaskIndex, string textResponse, uint32 targetScoreResponse,uint32 gameIdResponse, bytes memory signature) external",
  "event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock, uint32 scoreDifference) task)",
]);

async function createSignature(
  account: any,
  textResponse: string,
  gameIdResponse: number,
  targetScoreResponse: number,
  contents: string
) {
  // Match the contract's encoding exactly
  const messageHash = keccak256(
    encodePacked(
      ["string", "uint32", "uint32", "string"],
      [textResponse, gameIdResponse, targetScoreResponse, contents]
    )
  );

  // Sign the message directly (not the raw hash)
  const signature = await account.signMessage({
    message: { raw: messageHash },
  });

  return signature;
}

async function respondToTask(
  walletClient: any,
  publicClient: any,
  contractAddress: string,
  account: any,
  task: Task,
  taskIndex: number
) {
  try {
    const response = await ollama.chat({
      model: "llama3.2",
      messages: [{ role: "user", content: task.contents }],
    });

    // let isHappy = true;
    // if (response.message.content.includes("unsafe")) {
    //   isHappy = false;
    // }
    const textResponse = response.message.content;
    const gameIdResponse = 1;
    const targetScoreResponse = task.scoreDifference;

    const signature = await createSignature(
      account,
      textResponse,
      gameIdResponse,
      targetScoreResponse,
      task.contents
    );

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: "respondToTask",
      args: [
        task,
        taskIndex,
        textResponse,
        gameIdResponse,
        targetScoreResponse,
        signature,
      ],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Responded to task:", {
      taskIndex,
      task,
      textResponse,
      gameIdResponse,
      targetScoreResponse,
      transactionHash: hash,
    });
  } catch (error) {
    console.error("Error responding to task:", error);
  }
}

async function main() {
  const contractAddress = "0x4fC92Db7DD04f69e8ed448747F589FFD91622886";

  const account = privateKeyToAccount(
    process.env.OPERATOR_PRIVATE_KEY as `0x${string}`
  );

  const publicClient = createPublicClient({
    chain: anvil,
    transport: http("http://localhost:8545"),
  });

  const walletClient = createWalletClient({
    chain: anvil,
    transport: http("http://localhost:8545"),
    account,
  });

  console.log("Starting to watch for new tasks...");
  publicClient.watchEvent({
    address: contractAddress,
    event: parseAbiItem(
      "event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock, uint32 scoreDifference) task)"
    ) as AbiEvent,
    onLogs: async (logs) => {
      for (const log of logs) {
        const { args } = log;
        if (!args) continue;

        const taskIndex = Number(args.taskIndex);
        const task = args.task as Task;

        console.log("New task detected:", {
          taskIndex,
          task,
        });

        await respondToTask(
          walletClient,
          publicClient,
          contractAddress,
          account,
          task,
          taskIndex
        );
      }
    },
  });

  process.on("SIGINT", () => {
    console.log("Stopping task watcher...");
    process.exit();
  });

  await new Promise(() => {});
}

main().catch(console.error);
