export interface ApiResponse<T> {
  isSuccess: boolean;
  data: T;
  error?: ApiError;
}

export interface ApiError {
  message: string;
  statusCode: number;
}
