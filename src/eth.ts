import {
  AggregateContractResponse,
  ContractCallArgs,
  EthFormatValue,
  EthProvider,
  MultiCallArgs,
  SendTransaction,
  SimpleTransactionResult,
  TronProvider,
} from "./types";
import {
  buildAggregateCall,
  buildUpAggregateResponse,
  transformContractCallArgs,
} from "./contract-utils";
import { retry } from "./helper";
import wait from "wait";
import { ContractHelperBase } from "./contract-helper-base";
import {
  Contract,
  FeeData,
  FunctionFragment,
  Interface,
  TransactionReceipt,
  getAddress,
} from "ethers";
import BigNumber from "bignumber.js";
import { TransactionReceiptError } from "./errors";

const ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate",
    outputs: [
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
      { internalType: "bytes[]", name: "returnData", type: "bytes[]" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "blockAndAggregate",
    outputs: [
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
      { internalType: "bytes32", name: "blockHash", type: "bytes32" },
      {
        components: [
          { internalType: "bool", name: "success", type: "bool" },
          { internalType: "bytes", name: "returnData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "blockNumber", type: "uint256" }],
    name: "getBlockHash",
    outputs: [{ internalType: "bytes32", name: "blockHash", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBlockNumber",
    outputs: [
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentBlockCoinbase",
    outputs: [{ internalType: "address", name: "coinbase", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentBlockDifficulty",
    outputs: [{ internalType: "uint256", name: "difficulty", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentBlockGasLimit",
    outputs: [{ internalType: "uint256", name: "gaslimit", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentBlockTimestamp",
    outputs: [{ internalType: "uint256", name: "timestamp", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "addr", type: "address" }],
    name: "getEthBalance",
    outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getLastBlockHash",
    outputs: [{ internalType: "bytes32", name: "blockHash", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bool", name: "requireSuccess", type: "bool" },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "tryAggregate",
    outputs: [
      {
        components: [
          { internalType: "bool", name: "success", type: "bool" },
          { internalType: "bytes", name: "returnData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bool", name: "requireSuccess", type: "bool" },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "tryBlockAndAggregate",
    outputs: [
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
      { internalType: "bytes32", name: "blockHash", type: "bytes32" },
      {
        components: [
          { internalType: "bool", name: "success", type: "bool" },
          { internalType: "bytes", name: "returnData", type: "bytes" },
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export class EthContractHelper<
  Provider extends TronProvider | EthProvider
> extends ContractHelperBase<Provider> {
  private provider: EthProvider;
  private simulate: boolean;
  private formatValueType: EthFormatValue;

  constructor(
    multicallContractAddress: string,
    provider: EthProvider,
    simulate: boolean,
    formatValue: EthFormatValue
  ) {
    super(multicallContractAddress);
    this.provider = provider;
    this.simulate = simulate;
    this.formatValueType = formatValue;
  }

  private buildAggregateCall(multiCallArgs: MultiCallArgs<Provider>[]) {
    return buildAggregateCall<Provider>(
      multiCallArgs,
      function (fragment: FunctionFragment, values?: ReadonlyArray<any>) {
        const iface = new Interface([fragment]);
        const encodedData = iface.encodeFunctionData(fragment, values);
        return encodedData;
      },
      "eth"
    );
  }

  private buildUpAggregateResponse<T>(
    multiCallArgs: MultiCallArgs<Provider>[],
    response: AggregateContractResponse
  ) {
    return buildUpAggregateResponse<Provider, T>(
      multiCallArgs,
      response,
      function (fragment, data) {
        const interf = new Interface([fragment]);
        let result = interf.decodeFunctionResult(fragment, data);
        return result;
      },
      (value, fragment) => {
        return this.handleContractValue(value, fragment);
      },
      "eth"
    );
  }

  private formatValue(value: any, type: string) {
    switch (true) {
      case type.endsWith("[]"):
        const itemType = type.slice(0, -2);
        return value.map((el: any) => this.formatValue(el, itemType));
      case type.startsWith("uint"):
      case type.startsWith("int"):
        return this.formatValueType?.uint === "bigint"
          ? BigInt(value.toString())
          : new BigNumber(value.toString());
      case type === "address":
        return this.formatValueType?.address === "hex"
          ? getAddress(value).toLowerCase()
          : getAddress(value);
      default:
        return value;
    }
  }

  private handleContractValue<T>(
    value: any,
    functionFragment: FunctionFragment
  ) {
    const outputs = functionFragment.outputs;
    if (outputs && outputs.length === 1 && !outputs[0].name) {
      return this.formatValue(value, outputs[0].type);
    }
    const result: Array<any> = [];
    for (let [index, output] of outputs.entries()) {
      result[index] = this.formatValue(value[index], output.type);
      if (output.name) {
        result[output.name] = this.formatValue(value[output.name], output.type);
      }
    }
    return result;
  }

  /**
   * Execute the multicall contract call
   * @param calls The calls
   */
  public async multicall<T>(calls: MultiCallArgs<Provider>[]) {
    const multicallContract = new Contract(
      this.multicallAddress,
      ABI,
      this.provider
    );
    const multicalls = this.buildAggregateCall(calls);
    const response: AggregateContractResponse =
      await multicallContract.aggregate.staticCall(
        multicalls.map((call) => ({
          target: call.target,
          callData: call.encodedData,
        }))
      );
    return this.buildUpAggregateResponse<T>(calls, response);
  }

  public async call<T>(contractCallArgs: ContractCallArgs<Provider>) {
    const {
      address,
      abi,
      method,
      parameters = [],
    } = transformContractCallArgs(contractCallArgs, "eth");
    const contract = new Contract(address, abi, this.provider);
    const rawResult = await contract[method.name](...parameters);
    const result = this.handleContractValue(rawResult, method.fragment);
    return result as T;
  }

  async send(
    from: string,
    sendTransaction: SendTransaction<Provider>,
    contractOption: ContractCallArgs<Provider>
  ) {
    const {
      address,
      abi,
      method,
      options,
      parameters = [],
    } = transformContractCallArgs(contractOption, "eth");
    const chainId = (await this.provider.getNetwork()).chainId;
    const nonce = await this.provider.getTransactionCount(from);
    const interf = new Interface(abi);
    const data = interf.encodeFunctionData(method.fragment, parameters);
    const tx: any = {
      ...options,
      to: address,
      data,
      nonce,
      chainId,
      type: 2,
      from,
    };
    if (!tx?.gasPrice) {
      const feeData = await this.provider.getFeeData();
      if (!tx?.maxFeePerGas) {
        tx.maxFeePerGas = feeData.maxFeePerGas;
      }
      if (!tx?.maxPriorityFeePerGas) {
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      }
    }
    if (!tx?.gasLimit) {
      const estimatedGas = await this.provider.estimateGas(tx);
      const gasLimit = (estimatedGas * 120n) / 100n;
      tx.gasLimit = gasLimit;
    }

    if (this.simulate) {
      try {
        await this.provider.call({ ...tx, from });
      } catch (err: any) {
        console.error(err);
        throw err;
      }
    }
    const txId = await sendTransaction(
      { ...tx },
      // @ts-ignore
      this.provider,
      false
    );
    return txId;
  }

  private async checkReceipt(
    txId: string,
    confirmations: number
  ): Promise<TransactionReceipt> {
    return retry(
      async () => {
        const receipt = await this.provider.getTransactionReceipt(txId);
        if (!receipt) {
          await wait(1000);
          return this.checkReceipt(txId, confirmations);
        }
        const receiptConfirmations = await receipt.confirmations();
        if (receiptConfirmations < confirmations) {
          await wait(1000);
          return this.checkReceipt(txId, confirmations);
        }
        if (!receipt.status) {
          throw new TransactionReceiptError("Transaction execute reverted", {
            txId: txId,
            blockNumber:
              confirmations >= 5 ? BigInt(receipt.blockNumber) : undefined,
          });
        }
        return receipt;
      },
      10,
      1000
    );
  }

  public async finalCheckTransactionResult(
    txId: string
  ): Promise<SimpleTransactionResult> {
    const receipt = await this.checkReceipt(txId, 5);
    return {
      blockNumber: BigInt(receipt.blockNumber),
      txId: receipt.hash,
    };
  }

  public async fastCheckTransactionResult(txId: string) {
    const receipt = await this.checkReceipt(txId, 0);
    return { txId: receipt.hash };
  }
}
