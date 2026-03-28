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

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const {
  RPC_URL = 'http://127.0.0.1:8545',
  RELAYER_PRIVATE_KEY,
  CONTRACT_ADDRESS,
  PORT = 3000,
  OTP_EXPIRY_SECONDS = '300',
  FACE_DISTANCE_THRESHOLD = '0.6'
} = process.env;

if (!RELAYER_PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.warn('Missing RELAYER_PRIVATE_KEY or CONTRACT_ADDRESS. Face enroll / credential issuance will fail until configured.');
}

const ABI = [
  'function registerEligibleNullifier(bytes32 nullifierHash) external',
  'function registerFaceHash(bytes32 faceHash) external',
  'function candidateCount() view returns (uint256)',
  'function getCandidate(uint256 candidateId) view returns (string name, uint256 votes)'
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = RELAYER_PRIVATE_KEY ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider) : null;
const contract = wallet ? new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet) : null;
const contractRead = CONTRACT_ADDRESS ? new ethers.Contract(CONTRACT_ADDRESS, ABI, provider) : null;

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = fs.existsSync(dbPath)
  ? JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
  : { students: {}, credentials: {} };

function persist() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    throw new Error('Embedding must be a 128-length array');
  }

  return embedding.map((n) => {
    const val = Number(n);
    if (!Number.isFinite(val)) {
      throw new Error('Embedding includes invalid numbers');
    }
    return Number(val.toFixed(6));
  });
}

function hashEmbedding(embedding) {
  const normalized = normalizeEmbedding(embedding);
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(normalized)));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = a[i] - b[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'securevote-backend', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.json({
    contractAddress: CONTRACT_ADDRESS || null,
    chainRpcConfigured: Boolean(RPC_URL),
    faceDistanceThreshold: Number(FACE_DISTANCE_THRESHOLD)
  });
});

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

app.post('/api/enroll-face', async (req, res) => {
  try {
    const { studentId, embedding } = req.body;
    const student = db.students[studentId];

    if (!student?.verified) {
      return res.status(403).json({ error: 'Not verified' });
    }

    if (!contract) {
      return res.status(500).json({ error: 'Blockchain not configured' });
    }

    const normalizedEmbedding = normalizeEmbedding(embedding);
    const faceHash = hashEmbedding(normalizedEmbedding);

    if (!student.faceHash) {
      const faceTx = await contract.registerFaceHash(faceHash);
      await faceTx.wait();
    }

    // Issue nullifier once during enrollment.
    if (!student.nullifierHash) {
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const nullifierHash = ethers.keccak256(secret);
      const nullifierTx = await contract.registerEligibleNullifier(nullifierHash);
      await nullifierTx.wait();

      student.secret = secret;
      student.nullifierHash = nullifierHash;
      db.credentials[nullifierHash] = { studentId, issuedAt: Date.now() };
    }

    student.faceHash = faceHash;
    student.faceEmbedding = normalizedEmbedding;
    persist();

    return res.json({
      message: 'Face enrolled and voting credential issued',
      faceHash,
      nullifierHash: student.nullifierHash
    });
  } catch (error) {
    return res.status(500).json({ error: error.shortMessage || error.message });
  }
});

app.post('/api/verify-face', (req, res) => {
  try {
    const { studentId, embedding } = req.body;
    const student = db.students[studentId];

    if (!student?.verified || !student.faceHash || !student.faceEmbedding || !student.nullifierHash) {
      return res.status(403).json({ error: 'Student must verify OTP and enroll face first' });
    }

    if (student.voted) {
      return res.status(400).json({ error: 'Vote already cast for this student' });
    }

    const liveEmbedding = normalizeEmbedding(embedding);
    const distance = euclideanDistance(liveEmbedding, student.faceEmbedding);

    if (distance > Number(FACE_DISTANCE_THRESHOLD)) {
      return res.status(401).json({ error: `Face mismatch (distance=${distance.toFixed(4)})` });
    }

    return res.json({
      ok: true,
      faceHash: student.faceHash,
      nullifierHash: student.nullifierHash,
      distance
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/mark-voted', (req, res) => {
  const { studentId } = req.body;
  const student = db.students[studentId];
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  student.voted = true;
  persist();
  return res.json({ ok: true });
});

// Backward-compatible endpoint for previous clients.
app.post('/api/issue-credential', (req, res) => {
  const { studentId } = req.body;
  const student = db.students[studentId];

  if (!student?.verified) {
    return res.status(403).json({ error: 'Student not verified' });
  }

  if (!student.nullifierHash || !student.faceHash) {
    return res.status(400).json({ error: 'Use /api/enroll-face first to issue credential' });
  }

  return res.json({
    message: 'Credential already issued via face enrollment',
    nullifierHash: student.nullifierHash,
    faceHash: student.faceHash
  });
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

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SecureVote backend running on http://0.0.0.0:${PORT}`);
});
