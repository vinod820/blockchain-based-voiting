// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SecureVote {
    address public immutable admin;
    uint256 public immutable startTime;
    uint256 public immutable endTime;

    struct Candidate {
        string name;
        uint256 votes;
    }

    Candidate[] public candidates;

    mapping(bytes32 => bool) public eligibleNullifier;
    mapping(bytes32 => bool) public usedNullifier;
    mapping(bytes32 => bool) public registeredFaceHash;

    event EligibleNullifierRegistered(bytes32 indexed nullifierHash);
    event FaceHashRegistered(bytes32 indexed faceHash);
    event VoteCast(bytes32 indexed nullifierHash, bytes32 indexed faceHash, uint256 indexed candidateId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(
        string[] memory candidateNames,
        uint256 _startTime,
        uint256 _endTime
    ) {
        require(candidateNames.length > 1, "Need >= 2 candidates");
        require(_startTime < _endTime, "Invalid time range");

        admin = msg.sender;
        startTime = _startTime;
        endTime = _endTime;

        for (uint256 i = 0; i < candidateNames.length; i++) {
            candidates.push(Candidate({name: candidateNames[i], votes: 0}));
        }
    }

    function registerEligibleNullifier(bytes32 nullifierHash) external onlyAdmin {
        require(!eligibleNullifier[nullifierHash], "Already eligible");
        eligibleNullifier[nullifierHash] = true;
        emit EligibleNullifierRegistered(nullifierHash);
    }

    function registerFaceHash(bytes32 faceHash) external onlyAdmin {
        require(!registeredFaceHash[faceHash], "Already registered");
        registeredFaceHash[faceHash] = true;
        emit FaceHashRegistered(faceHash);
    }

    function castVote(bytes32 nullifierHash, bytes32 faceHash, uint256 candidateId) external {
        require(block.timestamp >= startTime, "Election not started");
        require(block.timestamp <= endTime, "Election closed");
        require(registeredFaceHash[faceHash], "Face not registered");
        require(eligibleNullifier[nullifierHash], "Not eligible");
        require(!usedNullifier[nullifierHash], "Already voted");
        require(candidateId < candidates.length, "Invalid candidate");

        usedNullifier[nullifierHash] = true;
        candidates[candidateId].votes += 1;

        emit VoteCast(nullifierHash, faceHash, candidateId);
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getCandidate(uint256 candidateId) external view returns (string memory name, uint256 votes) {
        Candidate memory c = candidates[candidateId];
        return (c.name, c.votes);
    }

    function getResults() external view returns (Candidate[] memory) {
        return candidates;
    }
}
