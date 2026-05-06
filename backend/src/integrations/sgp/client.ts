import axios, { AxiosError } from 'axios';
import { env } from '../../config/env';

export const sgpClient = axios.create({
  baseURL: env.SGP_BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.SGP_API_TOKEN}`,
  },
});

sgpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url;
    console.error(`[SGP] ${status ?? 'NETWORK'} error on ${url ?? 'unknown'}:`, error.message);
    return Promise.reject(error);
  },
);
