export interface Citation {
  id: string;
  source: string;
  content: string;
  score?: number;
  chunk_index?: number;
  document_id?: string;
}
