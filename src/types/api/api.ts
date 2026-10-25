export interface ApiErrorBody {
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  isSuccess: true;
  status: number;
  message?: string;
  data: T;
}

export interface ApiFailure {
  isSuccess: false;
  status: number;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
