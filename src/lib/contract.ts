export const CT_GUESS_GAME_ABI = [
  {
    type: 'error',
    name: 'AlreadySubmitted',
    inputs: []
  },
  {
    type: 'error',
    name: 'InvalidEncryptedInput',
    inputs: [
      { name: 'got', type: 'uint8' },
      { name: 'expected', type: 'uint8' }
    ]
  },
  {
    type: 'error',
    name: 'InvalidRound',
    inputs: []
  },
  {
    type: 'error',
    name: 'RoundInactive',
    inputs: []
  },
  {
    type: 'error',
    name: 'SecurityZoneOutOfBounds',
    inputs: [{ name: 'value', type: 'int32' }]
  },
  {
    type: 'function',
    name: 'submitGuess',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'roundId', type: 'uint256' },
      {
        name: 'encryptedGuess',
        type: 'tuple',
        components: [
          { name: 'ctHash', type: 'uint256' },
          { name: 'securityZone', type: 'uint8' },
          { name: 'utype', type: 'uint8' },
          { name: 'signature', type: 'bytes' }
        ]
      }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'getAttempt',
    stateMutability: 'view',
    inputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'player', type: 'address' }
    ],
    outputs: [
      { name: 'submitted', type: 'bool' },
      { name: 'submittedAt', type: 'uint64' },
      { name: 'isCorrect', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    name: 'getRound',
    stateMutability: 'view',
    inputs: [{ name: 'roundId', type: 'uint256' }],
    outputs: [
      { name: 'active', type: 'bool' },
      { name: 'duration', type: 'uint64' },
      { name: 'hints', type: 'string[5]' },
      { name: 'options', type: 'string[3]' }
    ]
  }
] as const;
