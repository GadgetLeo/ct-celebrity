export type RoundOption =
  | string
  | {
      handle: string;
      avatar: string;
      name?: string;
    };

export type Round = {
  id: number;
  durationSeconds: number;
  hints: [string, string, string, string, string];
  options: [RoundOption, RoundOption, RoundOption];
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
