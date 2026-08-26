import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AiServiceError } from './ai-client.errors';
import {
  AiServiceHttpRequestOptions,
  AiServiceHttpTransport,
  mapAiServiceHttpStatus,
  mapAiServiceTransportError,
} from './http.transport';

@Injectable()
export class AxiosAiServiceHttpTransport implements AiServiceHttpTransport {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      validateStatus: () => true,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
    });
  }

  async post<TResponse>(
    url: string,
    body: unknown,
    options: AiServiceHttpRequestOptions,
  ): Promise<TResponse> {
    try {
      const response = await this.http.post<TResponse>(url, body, {
        timeout: options.timeoutMs,
        headers: options.headers,
      });
      if (response.status >= 200 && response.status < 300) return response.data;
      throw mapAiServiceHttpStatus(response.status);
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      throw mapAiServiceTransportError(error);
    }
  }
}
