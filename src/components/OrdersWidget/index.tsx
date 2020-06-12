import React, { useMemo, useCallback, useEffect } from 'react'
// eslint-disable-next-line @typescript-eslint/camelcase
import { unstable_batchedUpdates } from 'react-dom'

// Assets
import { faTrashAlt, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// Const and utils
import { isOrderActive, isPendingOrderActive } from 'utils'
import { DEFAULT_ORDERS_SORTABLE_TOPIC } from 'const'
import { filterTradesFn, filterOrdersFn } from 'utils/filter'

// Hooks
import { useOrders } from 'hooks/useOrders'
import { useTrades } from 'hooks/useTrades'
import useSafeState from 'hooks/useSafeState'
import useDataFilter from 'hooks/useDataFilter'
import useSortByTopic from 'hooks/useSortByTopic'
import { useWalletConnection } from 'hooks/useWalletConnection'

// Api
import { DetailedAuctionElement, DetailedPendingOrder, Trade } from 'api/exchange/ExchangeApi'

// Components
import { ConnectWalletBanner } from 'components/ConnectWalletBanner'
import { CardTable } from 'components/Layout/Card'
import { InnerTradesWidget } from 'components/TradesWidget'
import FilterTools from 'components/FilterTools'

// OrderWidget
import { useDeleteOrders } from 'components/OrdersWidget/useDeleteOrders'
import OrderRow from 'components/OrdersWidget/OrderRow'
import { OrdersWrapper, ButtonWithIcon, OrdersForm } from 'components/OrdersWidget/OrdersWidget.styled'

type OrderTabs = 'active' | 'liquidity' | 'closed' | 'fills'

interface ShowOrdersButtonProps {
  type: OrderTabs
  isActive: boolean
  count: number
  onClick: (event: React.SyntheticEvent<HTMLButtonElement | HTMLFormElement>) => void
}

const ShowOrdersButton: React.FC<ShowOrdersButtonProps> = ({ type, isActive, count, onClick }) => (
  <button type="button" className={isActive ? 'selected' : ''} onClick={onClick}>
    {type} <i>{count}</i>
  </button>
)

type FilteredOrdersStateKeys = Exclude<OrderTabs, 'fills'>
type FilteredOrdersState = {
  [key in FilteredOrdersStateKeys]: {
    orders: DetailedAuctionElement[]
    pendingOrders: DetailedPendingOrder[]
    markedForDeletion: Set<string>
  }
}

type TopicNames = 'validUntil'

function emptyState(): FilteredOrdersState {
  return {
    active: { orders: [], pendingOrders: [], markedForDeletion: new Set() },
    closed: { orders: [], pendingOrders: [], markedForDeletion: new Set() },
    liquidity: { orders: [], pendingOrders: [], markedForDeletion: new Set() },
  }
}

function classifyOrders(
  orders: DetailedAuctionElement[],
  state: FilteredOrdersState,
  ordersType: 'orders' | 'pendingOrders',
): void {
  const now = new Date()
  const isOrderActiveFn = ordersType === 'pendingOrders' ? isPendingOrderActive : isOrderActive

  orders.forEach(order => {
    if (!isOrderActiveFn(order, now)) {
      state.closed[ordersType].push(order)
    } else if (order.isUnlimited) {
      state.liquidity[ordersType].push(order)
    } else {
      state.active[ordersType].push(order)
    }
  })
}

const compareFnFactory = (topic: TopicNames, asc: boolean) => (
  lhs: DetailedAuctionElement,
  rhs: DetailedAuctionElement,
): number => {
  if (asc) {
    return lhs[topic] - rhs[topic]
  } else {
    return rhs[topic] - lhs[topic]
  }
}

interface Props {
  isWidget?: boolean
}

const OrdersWidget: React.FC<Props> = ({ isWidget = false }) => {
  const { orders: allOrders, pendingOrders: allPendingOrders, forceOrdersRefresh } = useOrders()
  // this page is behind login wall so networkId should always be set
  const { networkId, isConnected } = useWalletConnection()

  // allOrders and markedForDeletion, split by tab
  const [classifiedOrders, setClassifiedOrders] = useSafeState<FilteredOrdersState>(emptyState())
  const [selectedTab, setSelectedTab] = useSafeState<OrderTabs>('active')

  // Subscribe to trade events
  const trades = useTrades()

  // syntactic sugar
  const { displayedOrders, displayedPendingOrders, markedForDeletion } = useMemo(
    () => ({
      displayedOrders: selectedTab === 'fills' ? [] : classifiedOrders[selectedTab].orders,
      displayedPendingOrders: selectedTab === 'fills' ? [] : classifiedOrders[selectedTab].pendingOrders,
      markedForDeletion: selectedTab === 'fills' ? new Set<string>() : classifiedOrders[selectedTab].markedForDeletion,
    }),
    [classifiedOrders, selectedTab],
  )

  const setSelectedTabFactory = useCallback(
    (type: OrderTabs): ((event: React.SyntheticEvent<HTMLButtonElement | HTMLFormElement>) => void) => (
      event: React.SyntheticEvent<HTMLButtonElement | HTMLFormElement>,
    ): void => {
      // form is being submitted when clicking on tab buttons, thus preventing default
      event.preventDefault()

      setSelectedTab(type)
    },
    [setSelectedTab],
  )

  // Update classifiedOrders state whenever there's a change to allOrders
  // splitting orders into respective tabs
  useEffect(() => {
    const classifiedOrders = emptyState()

    classifyOrders(allOrders, classifiedOrders, 'orders')
    classifyOrders(allPendingOrders, classifiedOrders, 'pendingOrders')

    setClassifiedOrders(curr => {
      // copy markedForDeletion
      Object.keys(classifiedOrders).forEach(
        type => (classifiedOrders[type].markedForDeletion = curr[type].markedForDeletion),
      )
      return classifiedOrders
    })
  }, [allOrders, allPendingOrders, setClassifiedOrders])

  const ordersCount = displayedOrders.length + displayedPendingOrders.length

  const noOrders = allOrders.length === 0
  const noTrades = trades.length === 0

  const overBalanceOrders = useMemo(
    () =>
      new Set<string>(
        displayedOrders.filter(order => order.remainingAmount.gt(order.sellTokenBalance)).map(order => order.id),
      ),
    [displayedOrders],
  )

  // =========================================
  // SORTING + FILTERING
  // =========================================
  const { sortedData: sortedOrders, sortTopic, setSortTopic } = useSortByTopic<DetailedAuctionElement, TopicNames>(
    displayedOrders,
    DEFAULT_ORDERS_SORTABLE_TOPIC,
    compareFnFactory,
  )

  // Why 2 useDataFilter instead of concatenating pending + current?
  // I find the approach of using 2 hooks, 1 for each data set of orders (current, pending)
  // to be clearer than potentially using 1 data set concatenated + split to display
  // FILTER CURRENT ORDERS
  const {
    filteredData: filteredAndSortedOrders,
    search,
    handlers: { handleSearch: handleSearchingOrders },
  } = useDataFilter({
    data: sortedOrders,
    filterFnFactory: filterOrdersFn,
  })

  // FILTER PENDING ORDERS
  const {
    filteredData: filteredAndSortedPendingOrders,
    handlers: { handleSearch: handleSearchingPendingOrders },
  } = useDataFilter<DetailedPendingOrder>({
    data: displayedPendingOrders,
    filterFnFactory: filterOrdersFn,
  })

  const handleBothOrderTypeSearch = useCallback(
    (e): void => {
      handleSearchingOrders(e)
      handleSearchingPendingOrders(e)
    },
    [handleSearchingOrders, handleSearchingPendingOrders],
  )

  // =========================================
  // =========================================

  const toggleMarkForDeletionFactory = useCallback(
    (orderId: string, selectedTab: OrderTabs): (() => void) => (): void => {
      if (selectedTab === 'fills') return

      setClassifiedOrders(curr => {
        const state = emptyState()

        // copy full state
        Object.keys(curr).forEach(tab => (state[tab] = curr[tab]))

        // copy markedForDeletion set
        const newSet = new Set(curr[selectedTab].markedForDeletion)
        // toggle order
        newSet.has(orderId) ? newSet.delete(orderId) : newSet.add(orderId)
        // store new set
        state[selectedTab].markedForDeletion = newSet

        return state
      })
    },
    [setClassifiedOrders],
  )

  const toggleSelectAll = useCallback(
    ({ currentTarget: { checked } }: React.SyntheticEvent<HTMLInputElement>) => {
      if (selectedTab === 'fills') return

      setClassifiedOrders(curr => {
        const state = emptyState()

        // copy full state
        Object.keys(curr).forEach(tab => (state[tab] = curr[tab]))

        state[selectedTab].markedForDeletion = checked
          ? new Set(classifiedOrders[selectedTab].orders.map(order => order.id))
          : new Set()

        return state
      })
    },
    [classifiedOrders, selectedTab, setClassifiedOrders],
  )

  const { deleteOrders, deleting } = useDeleteOrders()

  const onSubmit = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault()

      if (selectedTab === 'fills') return

      const success = await deleteOrders(Array.from(markedForDeletion))

      if (success) {
        unstable_batchedUpdates(() => {
          // reset selections

          setClassifiedOrders(curr => {
            const state = emptyState()

            // copy full state
            Object.keys(curr).forEach(tab => (state[tab] = curr[tab]))

            // remove checked orders
            state[selectedTab].orders = curr[selectedTab].orders.filter(
              order => !curr[selectedTab].markedForDeletion.has(order.id),
            )
            // clear orders to delete
            state[selectedTab].markedForDeletion = new Set<string>()
            return state
          })

          // update the list of orders
          forceOrdersRefresh()
        })
      }
    },
    [deleteOrders, forceOrdersRefresh, markedForDeletion, selectedTab, setClassifiedOrders],
  )

  const {
    filteredData: filteredTrades,
    search: tradesSearch,
    handlers: { handleSearch: handleTradesSearch },
  } = useDataFilter<Trade>({
    data: trades,
    filterFnFactory: filterTradesFn,
  })

  const { handleTabSpecificSearch, tabSpecficSearch, tabSpecificResultName, tabSpecificDataLength } = useMemo(
    () => ({
      handleTabSpecificSearch: (e: React.ChangeEvent<HTMLInputElement>): void =>
        selectedTab === 'fills' ? handleTradesSearch(e) : handleBothOrderTypeSearch(e),
      tabSpecficSearch: selectedTab === 'fills' ? tradesSearch : search,
      tabSpecificResultName: selectedTab === 'fills' ? 'trades' : 'orders',
      tabSpecificDataLength:
        selectedTab === 'fills'
          ? filteredTrades.length
          : displayedPendingOrders.length + filteredAndSortedOrders.length,
    }),
    [
      selectedTab,
      tradesSearch,
      search,
      filteredTrades.length,
      displayedPendingOrders.length,
      filteredAndSortedOrders.length,
      handleTradesSearch,
      handleBothOrderTypeSearch,
    ],
  )

  return (
    <OrdersWrapper>
      {!isConnected ? (
        <ConnectWalletBanner />
      ) : (
        noOrders &&
        noTrades && (
          <p className="noOrdersInfo">
            It appears you haven&apos;t placed any order yet. <br /> Create one!
          </p>
        )
      )}
      {(!noOrders || !noTrades) && networkId && (
        <OrdersForm>
          <form action="submit" onSubmit={onSubmit}>
            <FilterTools
              className={isWidget ? 'widgetFilterTools' : ''}
              resultName={tabSpecificResultName}
              searchValue={tabSpecficSearch}
              handleSearch={handleTabSpecificSearch}
              showFilter={!!tabSpecficSearch}
              dataLength={tabSpecificDataLength}
            >
              {/* implement later when better data concerning order state and can be saved to global state 
              <label className="balances-hideZero">
                <input type="checkbox" checked={hideUntouchedOrders} onChange={handleHideUntouchedOrders} />
                <b>Hide untouched orders</b>
              </label>
              */}
            </FilterTools>
            {/* ORDERS TABS: ACTIVE/FILLS/LIQUIDITY/CLOSED */}
            <div className="infoContainer">
              <div className="countContainer">
                <ShowOrdersButton
                  type="active"
                  isActive={selectedTab === 'active'}
                  count={classifiedOrders.active.orders.length + classifiedOrders.active.pendingOrders.length}
                  onClick={setSelectedTabFactory('active')}
                />
                <ShowOrdersButton
                  type="fills"
                  isActive={selectedTab === 'fills'}
                  count={trades.length}
                  onClick={setSelectedTabFactory('fills')}
                />
                <ShowOrdersButton
                  type="liquidity"
                  isActive={selectedTab === 'liquidity'}
                  count={classifiedOrders.liquidity.orders.length + classifiedOrders.liquidity.pendingOrders.length}
                  onClick={setSelectedTabFactory('liquidity')}
                />
                <ShowOrdersButton
                  type="closed"
                  isActive={selectedTab === 'closed'}
                  count={classifiedOrders.closed.orders.length + classifiedOrders.closed.pendingOrders.length}
                  onClick={setSelectedTabFactory('closed')}
                />
                <ShowOrdersButton
                  type="fills"
                  isActive={selectedTab === 'fills'}
                  count={trades.length}
                  onClick={setSelectedTabFactory('fills')}
                />
              </div>
            </div>
            {/* DELETE ORDERS ROW */}
            <div className="deleteContainer" data-disabled={markedForDeletion.size === 0 || deleting}>
              <b>↴</b>
              <ButtonWithIcon disabled={markedForDeletion.size === 0 || deleting} type="submit">
                <FontAwesomeIcon icon={faTrashAlt} />{' '}
                {['active', 'liquidity'].includes(selectedTab) ? 'Cancel' : 'Delete'} {markedForDeletion.size} orders
              </ButtonWithIcon>
            </div>
            {/* FILLS AKA TRADES */}
            {selectedTab === 'fills' ? (
              <div className="ordersContainer">
                <InnerTradesWidget isTab trades={filteredTrades} />
              </div>
            ) : ordersCount > 0 ? (
              // ACTIVE / LIQUIDITY / CLOSED ORDERS
              <div className="ordersContainer">
                <CardTable
                  $columns="3.2rem repeat(2,1fr) minmax(5.2rem,0.6fr) minmax(7.2rem, 0.3fr)"
                  $gap="0 0.6rem"
                  $padding="0 0.8rem"
                  $rowSeparation="0"
                >
                  <thead>
                    <tr>
                      <th className="checked">
                        <input
                          type="checkbox"
                          onChange={toggleSelectAll}
                          checked={markedForDeletion.size === displayedOrders.length}
                          disabled={deleting}
                        />
                      </th>
                      <th>Limit price</th>
                      <th className="filled">Filled / Total</th>
                      <th
                        className="sortable"
                        onClick={(): void => setSortTopic(prev => ({ ...prev, asc: !prev.asc }))}
                      >
                        Expires <FontAwesomeIcon size="xs" icon={!sortTopic.asc ? faChevronDown : faChevronUp} />
                      </th>
                      <th className="status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedPendingOrders.map(order => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        networkId={networkId}
                        isOverBalance={false}
                        pending
                        disabled={deleting}
                        isPendingOrder
                        transactionHash={order.txHash}
                      />
                    ))}
                    {filteredAndSortedOrders.map(order => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        networkId={networkId}
                        isOverBalance={overBalanceOrders.has(order.id)}
                        isMarkedForDeletion={markedForDeletion.has(order.id)}
                        toggleMarkedForDeletion={toggleMarkForDeletionFactory(order.id, selectedTab)}
                        pending={deleting && markedForDeletion.has(order.id)}
                        disabled={deleting}
                      />
                    ))}
                  </tbody>
                </CardTable>
              </div>
            ) : (
              <div className="noOrders">
                <span>You have no {selectedTab} orders</span>
              </div>
            )}
          </form>
        </OrdersForm>
      )}
    </OrdersWrapper>
  )
}

export default OrdersWidget
