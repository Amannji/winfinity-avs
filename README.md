Starting the chain:

```
anvil --chain-id 31337 --fork-url https://eth.drpc.org
```

Fetch the Keys(Private and Operator)

Deploying the contract

```
forge script script/DeployMyServiceManager.sol --rpc-url http://localhost:8545 --broadcast
```
