import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const { RPC_URL = '', PRIVATE_KEY = '' } = process.env;

export default {
  solidity: '0.8.24',
  networks: {
    sepolia: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
