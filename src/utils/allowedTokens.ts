export const getAllowedTokens = (symbol = '', name = '', address = ''): boolean => {
  const allowedSymbols = ['GIV', 'USDC']
  const allowedNames = ['GIVToken', 'USD Coin']
  const allowedContractAddresses = [
    '0xf6537FE0df7F0Cc0985Cf00792CC98249E73EFa0',
    '0x09b0C19106e0DBCf4893B226CD9b81474C8D73E8',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b',
  ]

  console.log(symbol, name, address)

  return allowedSymbols.includes(symbol) || allowedNames.includes(name) || allowedContractAddresses.includes(address)
}
