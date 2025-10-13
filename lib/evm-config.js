// CommonJS runtime helpers for server.js and payout-service.js
const { ethers } = require('ethers');

function getEvmProvider() {
  const rpcUrl = process.env.NEXT_PUBLIC_EVM_RPC_URL || 'https://bsc-dataseed.binance.org';
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '56', 10);
  return new ethers.JsonRpcProvider(rpcUrl, chainId);
}

function getEvmExplorerUrl(hash) {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '56', 10);
  const isMainnet = chainId === 56;
  const base = isMainnet ? 'https://bscscan.com' : 'https://testnet.bscscan.com';
  return `${base}/tx/${hash}`;
}

module.exports = { getEvmProvider, getEvmExplorerUrl };


