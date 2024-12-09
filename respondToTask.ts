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
    //Game Response Categories

    // Perform sentiment analysis on the task contents

    //CASES:

    let textResponse;
    let gameIdResponse;
    let targetScoreResponse;

    // Case 1: When scoreDifference is 1000
    if (task.scoreDifference === 30) {
      const response = await ollama.chat({
        model: "llama3.2",
        messages: [
          {
            role: "system",
            content:
              "You are a sentiment analysis assistant. Analyze the emotional tone of the text and classify it as either STRONG_HAPPY or OTHER. Respond with just the classification.",
          },
          {
            role: "user",
            content: task.contents,
          },
        ],
      });

      const sentiment = response.message.content;
      if (sentiment.includes("STRONG_HAPPY")) {
        gameIdResponse = 1;
        targetScoreResponse = 40; // High target score
      } else {
        gameIdResponse = 2;
        targetScoreResponse = 10; // Medium target score
      }
      textResponse = sentiment;
    }
    // Case 2: When contents is empty, analyze scoreDifference
    else if (task.contents === "") {
      if (task.scoreDifference > 10) {
        textResponse =
          "The score difference indicates strong positive momentum!";
        gameIdResponse = 1;
        targetScoreResponse = 40; // High target score
      } else if (task.scoreDifference < 10) {
        textResponse = "The situation shows relief and steady progress.";
        gameIdResponse = 2;
        targetScoreResponse = 20; // Low target score
      } else {
        textResponse = "Neutral sentiment detected based on score difference.";
        gameIdResponse = 1;
        targetScoreResponse = 30; // Medium target score
      }
    }
    // Default case
    else {
      const response = await ollama.chat({
        model: "llama3.2",
        messages: [
          {
            role: "system",
            content:
              "You are a sentiment analysis assistant and a game curator. Analyze the emotional tone of the text and respond with a statement about how the game you gonna present next will be appeal to the user. Keep the responses friendly, like you are complimenting the user. Keep response very concise",
          },
          {
            role: "user",
            content: task.contents,
          },
        ],
      });
      textResponse = response.message.content;

      targetScoreResponse = task.scoreDifference;
      if (response.message.content.includes("positive")) {
        gameIdResponse = 1;
      } else {
        gameIdResponse = 3;
      }
    }

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
  const contractAddress = "0x4fC92Db7DD04f69e8ed448747F589FFD91622886"; // The contract is deployed on the local chain

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
