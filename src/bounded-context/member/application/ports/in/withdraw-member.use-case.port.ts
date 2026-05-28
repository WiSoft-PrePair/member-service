export interface WithdrawMemberUseCase {
  execute(memberId: string): Promise<void>;
}
