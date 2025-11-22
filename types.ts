export enum AppMode {
  INGEST = 'INGEST',
  PROCESSING = 'PROCESSING',
  DASHBOARD = 'DASHBOARD',
}

export interface Paper {
  title: string;
  authors: string[];
  year: string;
  summary: string;
  highlights: string[];
  link: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  citations?: string[];
}

export interface ProcessingLog {
  step: string;
  status: 'pending' | 'active' | 'completed';
  detail?: string;
}

export interface TrainingMetric {
  epoch: number;
  loss: number;
  accuracy: number;
}
