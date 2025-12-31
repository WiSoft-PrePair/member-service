export interface SuccessResponse<T = unknown> {
  statusCode: number;
  data: T;
  message: string;
}

export interface ErrorResponse {
  statusCode: number;
  error: {
    code: string;
    message: string;
  };
}
