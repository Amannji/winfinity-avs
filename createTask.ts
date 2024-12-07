import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import "dotenv/config";

if (!process.env.PRIVATE_KEY) {
  throw new Error("Private key is not set");
}

type Task = {
  contents: string;
  taskCreatedBlock: number;
};

const abi = parseAbi([
  "function createTask(string memory contents) external returns ((string contents, uint256 taskCreatedBlock))",
]);

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

  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: "createTask",
      args: ["What a wonderful world!"],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Transaction hash", hash);
    console.log("Transaction receipt:", receipt);
  } catch (error) {
    console.error(error);
  }
}

main().catch(console.error);
