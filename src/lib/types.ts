export type Round = {
  id: number;
  durationSeconds: number;
  hints: [string, string, string, string, string];
  options: [string, string, string];
  correctOptionIndex: number;
};

export type SubmitState =
  | 'idle'
  | 'encrypting'
  | 'submitting'
  | 'correct'
  | 'incorrect'
  | 'timeout'
  | 'error';
