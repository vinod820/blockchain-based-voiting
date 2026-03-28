import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SecureVote', function () {
  it('requires registered face + eligible nullifier and allows one vote', async function () {
    const now = Math.floor(Date.now() / 1000);
    const [admin] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('SecureVote');
    const vote = await Factory.deploy(['A', 'B'], now - 10, now + 300);
    await vote.waitForDeployment();

    const nullifier = ethers.keccak256(ethers.toUtf8Bytes('student-secret'));
    const faceHash = ethers.keccak256(ethers.toUtf8Bytes('face-embedding'));

    await vote.registerFaceHash(faceHash);
    await vote.registerEligibleNullifier(nullifier);
    await vote.castVote(nullifier, faceHash, 1);

    const [, bVotes] = await vote.getCandidate(1);
    expect(bVotes).to.equal(1n);

    await expect(vote.castVote(nullifier, faceHash, 0)).to.be.revertedWith('Already voted');
    expect(await vote.admin()).to.equal(admin.address);
  });
});
