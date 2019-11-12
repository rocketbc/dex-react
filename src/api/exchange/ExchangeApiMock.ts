import assert from 'assert'

import { DepositApiMock, BalancesByUserAndToken } from './DepositApiMock'
import { ExchangeApi, Order, PlaceOrderParams, Erc20Api, TxResult, TxOptionalParams } from 'types'
import { FEE_DENOMINATOR } from 'const'
import { waitAndSendReceipt } from 'utils/mock'
import { RECEIPT } from '../../../test/data'

export interface OrdersByUser {
  [userAddress: string]: Order[]
}

/**
 * Basic implementation of Stable Coin Converter API
 */
export class ExchangeApiMock extends DepositApiMock implements ExchangeApi {
  private registeredTokens: string[]
  private tokenAddressToId: { [address in string]: number } // reverse mapping of registeredTokens for faster access
  private maxTokens: number
  private orders: OrdersByUser

  public constructor(
    balanceStates: BalancesByUserAndToken,
    erc20Api: Erc20Api,
    registeredTokens: string[] = [],
    maxTokens: number = 10000,
    ordersByUser: OrdersByUser = {},
  ) {
    super(balanceStates, erc20Api)
    this.registeredTokens = registeredTokens
    this.tokenAddressToId = registeredTokens.reduce((obj, address, index) => {
      obj[address] = index
      return obj
    }, {})
    this.maxTokens = maxTokens
    this.orders = ordersByUser
  }

  public async getOrders(userAddress: string): Promise<Order[]> {
    this._initOrders(userAddress)
    return this.orders[userAddress]
  }

  public async getNumTokens(): Promise<number> {
    return this.registeredTokens.length
  }

  /**
   * Fee is 1/fee_denominator.
   * i.e. 1/1000 = 0.1%
   */
  public async getFeeDenominator(): Promise<number> {
    return FEE_DENOMINATOR
  }

  public async getTokenAddressById(tokenId: number): Promise<string> {
    assert(typeof this.registeredTokens[tokenId] === 'string', 'Must have ID to get Address')
    return this.registeredTokens[tokenId]
  }

  public async getTokenIdByAddress(tokenAddress: string): Promise<number> {
    assert(typeof this.tokenAddressToId[tokenAddress] === 'number', 'Must have Address to get ID')
    return this.tokenAddressToId[tokenAddress]
  }

  public async addToken(tokenAddress: string, txOptionalParams?: TxOptionalParams): Promise<TxResult<void>> {
    await waitAndSendReceipt({ txOptionalParams })

    assert(typeof this.tokenAddressToId[tokenAddress] !== 'number', 'Token already registered')
    assert(this.registeredTokens.length < this.maxTokens, 'Max tokens reached')
    this.registeredTokens.push(tokenAddress)
    this.tokenAddressToId[tokenAddress] = this.registeredTokens.length - 1

    return { data: undefined, receipt: RECEIPT }
  }

  public async placeOrder(
    orderParams: PlaceOrderParams,
    txOptionalParams?: TxOptionalParams,
  ): Promise<TxResult<number>> {
    await waitAndSendReceipt({ txOptionalParams })

    this._initOrders(orderParams.userAddress)

    this.orders[orderParams.userAddress].push({
      buyTokenId: orderParams.buyTokenId,
      sellTokenId: orderParams.sellTokenId,
      validFrom: await this.getCurrentBatchId(),
      validUntil: orderParams.validUntil,
      priceNumerator: orderParams.buyAmount,
      priceDenominator: orderParams.sellAmount,
      remainingAmount: orderParams.sellAmount,
    })
    const orderId = this.orders[orderParams.userAddress].length - 1

    return { data: orderId, receipt: RECEIPT }
  }

  public async cancelOrder(
    senderAddress: string,
    orderId: number,
    txOptionalParams?: TxOptionalParams,
  ): Promise<TxResult<void>> {
    await waitAndSendReceipt({ txOptionalParams })

    this._initOrders(senderAddress)
    if (this.orders[senderAddress][orderId]) {
      this.orders[senderAddress][orderId].validUntil = (await this.getCurrentBatchId()) - 1
    }

    return { data: undefined, receipt: RECEIPT }
  }

  /********************************    private methods   ********************************/
  private _initOrders(userAddress: string): void {
    const userOrders = this.orders[userAddress]
    if (!userOrders) {
      this.orders[userAddress] = []
    }
  }
}

export default ExchangeApiMock
