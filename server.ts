import express, { Request, Response } from "express";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  type AbiEvent,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import "dotenv/config";
import cors from "cors";

const app = express();
const port = 3001;
app.use(cors());

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not found in environment variables");
}

const contractAddress = "0x4fC92Db7DD04f69e8ed448747F589FFD91622886";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: anvil,
  transport: http("http://localhost:8545"),
});

const walletClient = createWalletClient({
  chain: anvil,
  transport: http("http://localhost:8545"),
  account,
});

const abi = parseAbi([
  "function createTask(string memory contents, uint32 scoreDifference) external returns ((string contents, uint32 taskCreatedBlock))",
  "event TaskResponded(uint32 indexed taskIndex, string textResponse, uint32 gameIdResponse, uint32 targetScoreResponse, address responder)",
]);

app.get("/create-task", async (req, res) => {
  const { contents, scoreDifference } = req.query;

  if (!contents || !scoreDifference) {
    return res.status(400).json({
      error: "Missing required parameters: contents and scoreDifference",
    });
  }

  try {
    // Create a promise that will resolve when we get the response
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unwatch();
        reject(new Error("Timeout waiting for response"));
      }, 10000); // 10 second timeout

      const unwatch = publicClient.watchEvent({
        address: contractAddress,
        event: parseAbiItem(
          "event TaskResponded(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock, uint32 scoreDifference) task, string textResponse, uint32 gameIdResponse, uint32 targetScoreResponse, address operator)"
        ) as AbiEvent,
        onLogs: (logs) => {
          // We're interested in the most recent response
          const log = logs[logs.length - 1];
          if (!log.args) return "There was no args";

          // Type assertion to access args properties safely
          const args = log.args as {
            taskIndex: bigint;
            textResponse: string;
            gameIdResponse: bigint;
            targetScoreResponse: bigint;
            operator: string;
          };

          const response = {
            taskIndex: Number(args.taskIndex),
            textResponse: args.textResponse,
            gameIdResponse: Number(args.gameIdResponse),
            targetScoreResponse: Number(args.targetScoreResponse),
            responder: args.operator,
          };

          clearTimeout(timeout);
          unwatch();
          resolve(response);
        },
      });
    });

    // Create the task
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: "createTask",
      args: [contents as string, Number(scoreDifference)],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    console.log("Task creation transaction hash in server:", hash);

    // Wait for the response
    const response = await responsePromise;

    res.json({
      status: "success",
      transactionHash: hash,
      response,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
