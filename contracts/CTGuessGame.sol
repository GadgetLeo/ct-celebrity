// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, ebool, euint8, InEuint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract CTGuessGame {
    struct Round {
        bool exists;
        bool active;
        uint64 duration;
        euint8 encryptedCorrectOption;
        string[5] hints;
        string[3] options;
    }

    struct Attempt {
        bool submitted;
        uint64 submittedAt;
        ebool isCorrect;
    }

    address public owner;
    uint256 public roundCount;

    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => mapping(address => Attempt)) private _attempts;

    event RoundCreated(uint256 indexed roundId);
    event RoundStatusChanged(uint256 indexed roundId, bool active);
    event GuessSubmitted(uint256 indexed roundId, address indexed player);

    error NotOwner();
    error InvalidRound();
    error RoundInactive();
    error AlreadySubmitted();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createRound(
        string[5] calldata hints,
        string[3] calldata options,
        InEuint8 calldata encryptedCorrectOption,
        uint64 duration
    ) external onlyOwner returns (uint256 roundId) {
        roundId = ++roundCount;
        Round storage round = _rounds[roundId];
        round.exists = true;
        round.active = true;
        round.duration = duration;
        round.encryptedCorrectOption = FHE.asEuint8(encryptedCorrectOption);
        for (uint256 i = 0; i < 5; i++) {
            round.hints[i] = hints[i];
        }

        for (uint256 i = 0; i < 3; i++) {
            round.options[i] = options[i];
        }

        FHE.allowThis(round.encryptedCorrectOption);

        emit RoundCreated(roundId);
    }

    function setRoundActive(uint256 roundId, bool active) external onlyOwner {
        Round storage round = _rounds[roundId];
        if (!round.exists) revert InvalidRound();

        round.active = active;
        emit RoundStatusChanged(roundId, active);
    }

    function submitGuess(
        uint256 roundId,
        InEuint8 calldata encryptedGuess
    ) external {
        Round storage round = _rounds[roundId];
        if (!round.exists) revert InvalidRound();
        if (!round.active) revert RoundInactive();

        Attempt storage attempt = _attempts[roundId][msg.sender];
        if (attempt.submitted) revert AlreadySubmitted();

        euint8 guess = FHE.asEuint8(encryptedGuess);
        ebool isCorrect = FHE.eq(guess, round.encryptedCorrectOption);

        attempt.submitted = true;
        attempt.submittedAt = uint64(block.timestamp);
        attempt.isCorrect = isCorrect;

        FHE.allowThis(isCorrect);
        FHE.allowSender(isCorrect);

        emit GuessSubmitted(roundId, msg.sender);
    }

    function getRound(uint256 roundId)
        external
        view
        returns (
            bool active,
            uint64 duration,
            string[5] memory hints,
            string[3] memory options
        )
    {
        Round storage round = _rounds[roundId];
        if (!round.exists) revert InvalidRound();
        return (round.active, round.duration, round.hints, round.options);
    }

    function getAttempt(uint256 roundId, address player)
        external
        view
        returns (
            bool submitted,
            uint64 submittedAt,
            ebool isCorrect
        )
    {
        Attempt storage attempt = _attempts[roundId][player];
        return (
            attempt.submitted,
            attempt.submittedAt,
            attempt.isCorrect
        );
    }
}
