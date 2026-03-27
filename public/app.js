const $ = (id) => document.getElementById(id);

let credential = null;

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

$('credentialBtn').onclick = async () => {
  const studentId = $('studentId').value.trim();

  const res = await fetch('/api/issue-credential', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });
  const data = await res.json();

  if (data.error) {
    $('nullifier').textContent = `Error: ${data.error}`;
    return;
  }

  credential = data;
  $('nullifier').textContent = data.nullifierHash;
};

$('voteBtn').onclick = async () => {
  try {
    if (!window.ethereum) {
      $('voteOut').textContent = 'MetaMask not detected';
      return;
    }
    if (!credential) {
      $('voteOut').textContent = 'Issue credential first';
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

    const abi = ['function castVote(bytes32 nullifierHash, uint256 candidateId) external'];
    const contract = new Contract(contractAddress, abi, signer);

    const tx = await contract.castVote(credential.nullifierHash, candidateId);
    await tx.wait();

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
