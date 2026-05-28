export interface AddPointRequeset {
  memberId: string;
  amount: number;
}

export interface AddPointUseCase {
  execute(req: AddPointRequeset): Promise<void>;
}
