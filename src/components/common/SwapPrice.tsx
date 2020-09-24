import React from 'react'
import styled from 'styled-components'
import { displayTokenSymbolOrLink } from 'utils/display'
import { EllipsisText } from 'components/common/EllipsisText'

import { SwapIcon } from 'components/TradeWidget/SwapIcon'
import { safeTokenName, TokenDetails } from '@gnosis.pm/dex-js'

const SwapPriceWrapper = styled.div`
  display: inline-block;
  cursor: pointer;

  ${EllipsisText} {
    display: inline-block;
  }
`
export interface Props {
  baseToken: TokenDetails
  quoteToken: TokenDetails
  isPriceInverted: boolean
  onSwapPrices: () => void
  forLimitPrice?: boolean
}

export const SwapPrice: React.FC<Props> = ({ baseToken, quoteToken, isPriceInverted, onSwapPrices, forLimitPrice }) => {
  const displayQuoteToken = isPriceInverted ? baseToken : quoteToken
  const quoteTokenName = displayTokenSymbolOrLink(displayQuoteToken)

  let displayBaseToken
  let baseTokenName

  if (forLimitPrice) {
    displayBaseToken = isPriceInverted ? quoteToken : baseToken
    baseTokenName = displayTokenSymbolOrLink(displayBaseToken)
  }

  return (
    <SwapPriceWrapper onClick={onSwapPrices}>
      <EllipsisText $maxWidth={forLimitPrice ? '12ch' : '6ch'} title={safeTokenName(displayQuoteToken)}>
        {forLimitPrice ? `${quoteTokenName} per ${baseTokenName}` : quoteTokenName}
      </EllipsisText>
      <SwapIcon />
    </SwapPriceWrapper>
  )
}
