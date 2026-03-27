import { ethers } from 'hardhat';

const candidateList = (process.env.CANDIDATES || 'Alice,Bob').split(',').map((c) => c.trim());
const startDelaySeconds = Number(process.env.START_DELAY_SECONDS || 30);
const durationSeconds = Number(process.env.DURATION_SECONDS || 86400);

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + startDelaySeconds;
  const endTime = startTime + durationSeconds;

  const Factory = await ethers.getContractFactory('SecureVote');
  const contract = await Factory.deploy(candidateList, startTime, endTime);
  await contract.waitForDeployment();

  console.log('SecureVote deployed at:', await contract.getAddress());
  console.log('Start:', new Date(startTime * 1000).toISOString());
  console.log('End:', new Date(endTime * 1000).toISOString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
