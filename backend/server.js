import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const {
  RPC_URL = 'http://127.0.0.1:8545',
  RELAYER_PRIVATE_KEY,
  CONTRACT_ADDRESS,
  PORT = 3000,
  OTP_EXPIRY_SECONDS = '300'
} = process.env;

if (!RELAYER_PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.warn('Missing RELAYER_PRIVATE_KEY or CONTRACT_ADDRESS. Credential issuance will fail until configured.');
}

const ABI = [
  'function registerEligibleNullifier(bytes32 nullifierHash) external',
  'function candidateCount() view returns (uint256)',
  'function getCandidate(uint256 candidateId) view returns (string name, uint256 votes)'
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = RELAYER_PRIVATE_KEY ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider) : null;
const contract = wallet ? new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet) : null;
const contractRead = CONTRACT_ADDRESS ? new ethers.Contract(CONTRACT_ADDRESS, ABI, provider) : null;

const dbPath = path.join(__dirname, 'db.json');
const db = fs.existsSync(dbPath)
  ? JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
  : { students: {}, credentials: {} };

function persist() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/register', (req, res) => {
  const { studentId, email, name } = req.body;
  if (!studentId || !email || !name) {
    return res.status(400).json({ error: 'studentId, email and name are required' });
  }

  if (!email.endsWith('.edu') && !email.includes('college')) {
    return res.status(400).json({ error: 'Only verified college email is allowed' });
  }

  const otp = createOtp();
  db.students[studentId] = {
    studentId,
    email,
    name,
    verified: false,
    voted: false,
    otp,
    otpExpiresAt: Date.now() + Number(OTP_EXPIRY_SECONDS) * 1000
  };
  persist();

  return res.json({
    message: 'OTP generated (demo mode returns otp directly).',
    otp
  });
});

app.post('/api/verify-otp', (req, res) => {
  const { studentId, otp } = req.body;
  const student = db.students[studentId];

  if (!student) {
    return res.status(404).json({ error: 'Student not registered' });
  }

  if (Date.now() > student.otpExpiresAt) {
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (student.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  student.verified = true;
  student.otp = null;
  persist();
  return res.json({ message: 'Verification successful' });
});

app.post('/api/issue-credential', async (req, res) => {
  try {
    const { studentId } = req.body;
    const student = db.students[studentId];

    if (!student || !student.verified) {
      return res.status(403).json({ error: 'Student not verified' });
    }

    if (student.voted) {
      return res.status(400).json({ error: 'Vote credential already used' });
    }

    if (!contract) {
      return res.status(500).json({ error: 'Blockchain not configured' });
    }

    const secret = ethers.hexlify(ethers.randomBytes(32));
    const nullifierHash = ethers.keccak256(secret);

    const tx = await contract.registerEligibleNullifier(nullifierHash);
    await tx.wait();

    db.credentials[nullifierHash] = { studentId, issuedAt: Date.now() };
    student.voted = true;
    persist();

    return res.json({
      message: 'Credential issued. Keep secret safe.',
      secret,
      nullifierHash
    });
  } catch (error) {
    return res.status(500).json({ error: error.shortMessage || error.message });
  }
});

app.get('/api/results', async (_req, res) => {
  try {
    if (!contractRead) {
      return res.status(500).json({ error: 'Blockchain not configured' });
    }

    const count = Number(await contractRead.candidateCount());
    const results = [];
    for (let i = 0; i < count; i++) {
      const [name, votes] = await contractRead.getCandidate(i);
      results.push({ id: i, name, votes: Number(votes) });
    }

    return res.json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.shortMessage || error.message });
  }
});

app.listen(PORT, () => {
  console.log(`SecureVote backend running on http://localhost:${PORT}`);
});
