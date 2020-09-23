import React from 'react'
import styled from 'styled-components'

import { MEDIA } from 'const'

// Assets
import { faSkull } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// Layout: Subcomponents
import Header from 'components/layout/SwapLayout/Header'
import Footer from 'components/layout/SwapLayout/Footer'
import LegalBanner from 'components/LegalBanner'
import GlobalStyles from 'styles/global'

const Wrapper = styled.div`
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-flow: column wrap;

  main {
    flex: 0 1 auto;
    margin: 2.4rem auto 5rem;
    width: auto;
    display: flex;
    flex-flow: row wrap;
    align-items: flex-start;
    justify-content: flex-start;
    font-size: 1.3rem;
    line-height: 1.2;

    @media ${MEDIA.mobile} {
      width: 100%;
    }

    > section {
      width: 100%;

      @media ${MEDIA.mobile} {
        overflow: initial;
      }
    }

    @media ${MEDIA.mobile} {
      margin: 1.6rem auto 3.2rem;
    }
  }
`

const navigation = [
  {
    label: 'Trade',
    to: '/trade',
    order: 1,
  },
  // {
  //   label: 'Liquidity',
  //   to: '/liquidity',
  //   order: 2,
  //   withPastLocation: true,
  // },
  {
    label: 'Balances',
    to: '/wallet',
    order: 2,
    withPastLocation: true,
  },
  {
    label: 'Orders',
    to: '/orders',
    order: 3,
    withPastLocation: true,
  },
]

export const SwapLayout: React.FC = ({ children }) => (
  <>
    <GlobalStyles />
    <Wrapper>
      <LegalBanner>
        <p>
          <FontAwesomeIcon icon={faSkull} style={{ marginRight: '0.3rem' }} /> This project is in beta. Note that this
          is just a UI for the Gnosis Protocol&apos;s smart contract. Please DYOR. Use at your own risk.
        </p>
      </LegalBanner>
      <Header navigation={navigation} />
      <main>{children}</main>
      <Footer />
    </Wrapper>
  </>
)

export default SwapLayout
