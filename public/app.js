const $ = (id) => document.getElementById(id);

let credential = null;
let faceapiModule = null;
let modelsLoaded = false;

async function ensureFaceApiLoaded() {
  if (!faceapiModule) {
    faceapiModule = await import('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.esm.js');
  }

  if (!modelsLoaded) {
    const faceapi = faceapiModule;
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    modelsLoaded = true;
  }

  return faceapiModule;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false
  });
  $('video').srcObject = stream;
}

async function captureEmbedding() {
  const faceapi = await ensureFaceApiLoaded();
  const detection = await faceapi
    .detectSingleFace($('video'))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('No face detected. Adjust camera and lighting.');
  }

  return Array.from(detection.descriptor);
}

$('startCameraBtn').onclick = async () => {
  try {
    await startCamera();
    $('cameraOut').textContent = 'Camera started.';
  } catch (error) {
    $('cameraOut').textContent = `Camera error: ${error.message}`;
  }
};

$('registerBtn').onclick = async () => {
  const studentId = $('studentId').value.trim();
  const name = $('name').value.trim();
  const email = $('email').value.trim();

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, name, email })
  });
  const data = await res.json();
  $('otpOut').textContent = data.error ? `Error: ${data.error}` : `Demo OTP: ${data.otp}`;
};

$('verifyBtn').onclick = async () => {
  const studentId = $('studentId').value.trim();
  const otp = $('otp').value.trim();

  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, otp })
  });
  const data = await res.json();
  $('verifyOut').textContent = data.error ? `Error: ${data.error}` : data.message;
};

$('enrollFaceBtn').onclick = async () => {
  try {
    const studentId = $('studentId').value.trim();
    const embedding = await captureEmbedding();

    const res = await fetch('/api/enroll-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, embedding })
    });
    const data = await res.json();

    if (data.error) {
      $('faceHash').textContent = `Error: ${data.error}`;
      return;
    }

    credential = { nullifierHash: data.nullifierHash, faceHash: data.faceHash };
    $('faceHash').textContent = data.faceHash;
    $('nullifier').textContent = data.nullifierHash;
  } catch (error) {
    $('faceHash').textContent = `Error: ${error.message}`;
  }
};

$('verifyFaceBtn').onclick = async () => {
  try {
    const studentId = $('studentId').value.trim();
    const embedding = await captureEmbedding();

    const res = await fetch('/api/verify-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, embedding })
    });
    const data = await res.json();

    if (data.error) {
      $('verifyFaceOut').textContent = `Error: ${data.error}`;
      return;
    }

    credential = { nullifierHash: data.nullifierHash, faceHash: data.faceHash };
    $('verifyFaceOut').textContent = `Face verified (distance: ${Number(data.distance).toFixed(4)})`;
    $('faceHash').textContent = data.faceHash;
    $('nullifier').textContent = data.nullifierHash;
  } catch (error) {
    $('verifyFaceOut').textContent = `Error: ${error.message}`;
  }
};

$('voteBtn').onclick = async () => {
  try {
    if (!window.ethereum) {
      $('voteOut').textContent = 'MetaMask not detected';
      return;
    }
    if (!credential) {
      $('voteOut').textContent = 'Enroll and verify face first';
      return;
    }

    const [{ BrowserProvider, Contract }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm')
    ]);

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const contractAddress = $('contractAddress').value.trim();
    const candidateId = Number($('candidateId').value);

    const abi = ['function castVote(bytes32 nullifierHash, bytes32 faceHash, uint256 candidateId) external'];
    const contract = new Contract(contractAddress, abi, signer);

    const tx = await contract.castVote(credential.nullifierHash, credential.faceHash, candidateId);
    await tx.wait();

    await fetch('/api/mark-voted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: $('studentId').value.trim() })
    });

    $('voteOut').textContent = `Vote submitted. Tx: ${tx.hash}`;
  } catch (error) {
    $('voteOut').textContent = `Error: ${error.shortMessage || error.message}`;
  }
};

$('resultsBtn').onclick = async () => {
  const res = await fetch('/api/results');
  const data = await res.json();
  $('resultsOut').textContent = JSON.stringify(data, null, 2);
};
