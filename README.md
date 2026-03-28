# College SecureVote (Face + OTP + Blockchain MVP)

A functional MVP for college elections with:
- Student registration + OTP verification
- Face embedding enrollment in browser (face-api)
- On-chain registration of `keccak256(faceEmbedding)`
- Nullifier-based one-person-one-vote enforcement
- MetaMask vote casting and auditable on-chain tally

## Privacy model
- Raw face image stays in browser webcam flow.
- Browser sends only 128-D embedding vector to backend.
- Backend stores embedding (for similarity check) and writes only `faceHash` to chain.
- Smart contract stores only `bytes32 faceHash` and nullifier eligibility.

## Architecture flow
1. `POST /api/register` -> OTP generated.
2. `POST /api/verify-otp` -> student verified.
3. Browser captures embedding with face-api from webcam.
4. `POST /api/enroll-face` -> backend hashes embedding, registers face hash and nullifier on-chain.
5. On vote day, browser captures a fresh embedding.
6. `POST /api/verify-face` -> backend Euclidean distance match against enrolled embedding.
7. Frontend calls `castVote(nullifierHash, faceHash, candidateId)` through MetaMask.
8. `POST /api/mark-voted` marks off-chain state to block re-use in UI/backend.

## New dependency
```bash
npm install @vladmandic/face-api
```

## Face model files
Download these weights from:
- https://github.com/vladmandic/face-api/tree/master/model

Place them in:
- `public/models/`

Required models for this app:
- SSD MobileNet v1
- Face Landmark 68
- Face Recognition Net

## Quick start (local)
```bash
npm install
npx hardhat node
```

In another terminal:
```bash
cp .env.example .env
# set RPC_URL=http://127.0.0.1:8545 and PRIVATE_KEY from hardhat account
npm run deploy:local
```

Update `.env` with `CONTRACT_ADDRESS` and `RELAYER_PRIVATE_KEY`, then:
```bash
npm start
```

Open `http://localhost:3000`.

## Deploy to Sepolia
```bash
cp .env.example .env
# fill RPC_URL, PRIVATE_KEY, RELAYER_PRIVATE_KEY
npm run deploy:sepolia
# copy deployed address to CONTRACT_ADDRESS
npm start
```

## Deploy on Railway
1. Push this repo to GitHub.
2. In Railway: **New Project** -> **Deploy from GitHub Repo**.
3. Railway uses `railway.json` and starts with `npm start`.
4. Add Railway Variables:
   - `RPC_URL`
   - `RELAYER_PRIVATE_KEY`
   - `CONTRACT_ADDRESS`
   - `FACE_DISTANCE_THRESHOLD` (optional, default `0.6`)
   - `OTP_EXPIRY_SECONDS` (optional)
5. Verify deployment at `/api/health`.

> Note: Runtime storage is file-based in `backend/data/db.json` for MVP/demo. Use managed DB in production.

## API endpoints
- `GET /api/health`
- `GET /api/config`
- `POST /api/register`
- `POST /api/verify-otp`
- `POST /api/enroll-face`
- `POST /api/verify-face`
- `POST /api/mark-voted`
- `POST /api/issue-credential` (legacy compatibility)
- `GET /api/results`

## Contract security constraints (MVP)
- `faceHash` must be registered by admin/relayer.
- `nullifierHash` must be registered by admin/relayer.
- `nullifierHash` is single-use only.
- Vote window is bounded by start/end timestamps.

## Production cautions
- Use anti-spoofing/liveness checks for webcam capture.
- Use secure HSM/KMS for relayer keys.
- Encrypt biometric templates at rest.
- Perform smart contract and backend security audits.
