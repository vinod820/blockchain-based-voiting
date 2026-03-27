# College SecureVote (Blockchain + Anonymous Credential MVP)

A full functional MVP for college elections with:
- Student registration + OTP verification (backend)
- Anonymous vote credential issuance (nullifier hash)
- One-person-one-vote enforcement on-chain
- Vote casting through wallet (MetaMask)
- Public auditable results

## Architecture
1. Student registers and verifies OTP (`/api/register`, `/api/verify-otp`).
2. Backend issues a random secret and registers its `keccak256(secret)` as eligible on-chain.
3. Student casts vote with only the nullifier hash (no student ID sent on-chain).
4. Contract blocks duplicate nullifier usage and tallies votes.

## Tech
- Solidity + Hardhat
- Node.js + Express backend
- Ethers.js
- Static frontend (`public/`)

## Quick Start (Local)
```bash
npm install
npx hardhat node
```

In a second terminal:
```bash
cp .env.example .env
# set RPC_URL=http://127.0.0.1:8545 and PRIVATE_KEY from hardhat accounts
npm run deploy:local
```

Update `.env` with deployed `CONTRACT_ADDRESS` and `RELAYER_PRIVATE_KEY`, then:
```bash
npm start
```
Open http://localhost:3000.

## Deploy to Testnet (e.g., Sepolia)
```bash
cp .env.example .env
# fill RPC_URL, PRIVATE_KEY, RELAYER_PRIVATE_KEY
npm run deploy:sepolia
# copy address into CONTRACT_ADDRESS
npm start
```

## Deploy on Railway
1. Push this repo to GitHub.
2. In Railway, create a **New Project** -> **Deploy from GitHub Repo**.
3. Railway detects Node and uses `npm start` (configured in `railway.json`).
4. Add these Railway Variables:
   - `RPC_URL`
   - `RELAYER_PRIVATE_KEY`
   - `CONTRACT_ADDRESS`
   - `OTP_EXPIRY_SECONDS` (optional, default 300)
5. Redeploy the service.
6. Verify deployment health at: `https://<your-app>.up.railway.app/api/health`.

### Railway Notes
- Data is persisted to `backend/data/db.json` inside the container; treat it as demo storage.
- For production, replace file storage with PostgreSQL/Redis.
- Keep relayer keys in Railway Variables only (never commit secrets).

## API Endpoints
- `GET /api/health`
- `GET /api/config`
- `POST /api/register`
- `POST /api/verify-otp`
- `POST /api/issue-credential`
- `GET /api/results`

## Contract Security Guarantees (MVP)
- Immutable vote ledger (chain data)
- One nullifier = one vote
- Eligibility list managed by admin/relayer
- No direct identity stored on-chain

## Important Notes
- This is a production-like college MVP, not national-election-grade.
- For real deployment: add external audit, stronger credential cryptography (zk proofs), real OTP/SMS provider, secure key management (HSM/KMS), and persistent managed database.
