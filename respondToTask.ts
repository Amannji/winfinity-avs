import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
} from "viem";
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import ollama from "ollama";
import "dotenv/config";

if (!process.env.PRIVATE_KEY) {
  throw new Error("Private key is not set");
}

type Task = {
  contents: string;
  taskCreatedBlock: number;
};

const abi = parseAbi([
  "function respondToTask((string contents,uint32 taskCreatedBlock) task,uint32 taskIndex,bool isSafe, bytes signature) external returns (bool)",
  "event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock) task)",
]);

async function createSignature(
  account: any,
  ifSafe: boolean,
  contents: string
) {
  const messageHash = keccak256(
    encodePacked(["bool", false], [ifSafe, contents])
  );

  const signature = await account.signMessage({
    message: messageHash,
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
    const response = await ollama.generate({
      model: "llama-guard3:lb",
      prompt: task.contents,
    });

    let isSafe = true;
    if (response.message.content.includes("unsafe")) {
      isSafe = false;
    }

    const signature = await createSignature(
      account,
      isSafe,
      response.message.content
    );

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: "respondToTask",
      args: [task, taskIndex, isSafe, signature],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log("Responded to task", {
      taskIndex,
      task,
      isSafe,
      transactionHash: hash,
    });
  } catch (error) {
    console.log(error);
  }
}

async function main() {
  const contractAddress = "0x364C7188028348566E38D762f6095741c49f492B";

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

  console.log("Starting to watch for new tasks....");
  publicClient.watchEvent({
    address: contractAddress,
    event: parseAbiItem(
      "event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock) task)"
    ),
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
    console.log("Stopping task watcher.");
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch(console.error);
