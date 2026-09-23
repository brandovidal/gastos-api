export type ResponseSuccess<T> = {
  success: boolean
  code: string
  status: number
  message: string
  data: T
}

export type ErrorResponse = {
  success: boolean
  code: string
  status: number
  message: string
  details: any
  stack?: any
}

export type ResponseMessageProps = { code: string; message: string }
